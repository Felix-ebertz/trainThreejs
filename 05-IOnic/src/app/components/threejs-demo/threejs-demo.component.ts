import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { RangeCustomEvent } from '@ionic/angular';
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Clock, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene,
  TextureLoader, WebGLRenderer, AmbientLight, DirectionalLight, MeshPhysicalMaterial, CameraHelper, Vector3
} from 'three';

@Component({
  selector: 'app-threejs-demo',
  templateUrl: './threejs-demo.component.html',
  styleUrls: ['./threejs-demo.component.scss'],
})
export class ThreejsDemoComponent implements OnInit, AfterViewInit {
  @ViewChild('threejs', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private scene = new Scene();
  private camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  private renderer!: WebGLRenderer;
  private cube!: Mesh;
  private texturedCube!: Mesh;
  private map!: Mesh;
  private rotationspeed = 0;
  private clock = new Clock();
  private directionalLight!: DirectionalLight;

  // Camera controls
  private cameraVelocity = new Vector3(0, 0, 0);
  private cameraRotation = new Vector3(0, 0, 0);
  private isMouseDown = false;
  private lastMousePosition = { x: 0, y: 0 };

  constructor() { }

  ngOnInit() { }

  ngAfterViewInit() {
    this.initializeRenderer();
    this.setupCameraAndScene();
    this.loadTexture();
    this.loadTexturedCube();
    this.addEventListeners();
    this.startAnimation();
  }

  private initializeRenderer() {
    this.renderer = new WebGLRenderer({ canvas: this.canvas.nativeElement, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
  }

  private setupCameraAndScene() {
    this.cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffff00 }));
    this.cube.position.set(0, 9, 0);
    this.scene.add(this.cube);
    this.cube.castShadow = true;

    this.camera.position.set(20, 20, 20);
    this.camera.lookAt(0, 0, 0);
  }

  private loadTexture() {
    const loader = new TextureLoader();
    loader.load('assets/maps/heightmap.png', (texture) => this.generateTerrainFromTexture(texture.image as HTMLImageElement));
  }

  private loadTexturedCube() {
    const loader = new TextureLoader();

    loader.load('assets/textures/brick_diffuse.jpg', (diffuseTexture) => {
      loader.load('assets/textures/brick_normal.jpg', (normalTexture) => {
        const material = new MeshPhysicalMaterial({
          map: diffuseTexture,
          normalMap: normalTexture,
          roughness: 0.5,
          metalness: 0.1
        });

        const geometry = new BoxGeometry(2, 2, 2);
        this.texturedCube = new Mesh(geometry, material);
        this.texturedCube.position.set(5, 7, 5);
        this.texturedCube.castShadow = true;
        this.scene.add(this.texturedCube);
      });
    });
  }

  private generateTerrainFromTexture(image: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const vertices = [];
    const colors = [];

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const index = (x + z * width) * 4;
        const y = data[index] / 255;
        vertices.push(x - width / 2, y * 5, z - height / 2);
        colors.push(...this.getColorByHeight(y));
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
    geometry.setIndex(this.generateIndices(width, height));

    const material = new MeshPhysicalMaterial({
      vertexColors: true,
      wireframe: false,
      flatShading: true,
      reflectivity: 0.5,
      roughness: 0.8,
      metalness: 0.0
    });

    this.map = new Mesh(geometry, material);
    geometry.computeVertexNormals();
    this.map.position.set(0, 0, 0);
    this.map.receiveShadow = true;

    this.directionalLight = new DirectionalLight(0xffffff, 2);
    this.directionalLight.position.set(10, 20, 10);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 1024;
    this.directionalLight.shadow.mapSize.height = 1024;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 100;
    this.directionalLight.shadow.camera.left = -50;
    this.directionalLight.shadow.camera.right = 50;
    this.directionalLight.shadow.camera.top = 50;
    this.directionalLight.shadow.camera.bottom = -50;

    this.scene.add(this.directionalLight);

    const helper = new CameraHelper(this.directionalLight.shadow.camera);
    this.scene.add(helper);

    const ambientLight = new AmbientLight(0xffffff, 0.1);
    this.scene.add(ambientLight);
    this.scene.add(this.map);
  }

  private getColorByHeight(height: number): number[] {
    return height <= 0.5 ? [0.38, 0.68, 0.3, 1] : height <= 0.8 ? [0.8, 0.8, 0.3, 1] : [0.99, 0.99, 0.99, 1];
  }

  private generateIndices(width: number, height: number): number[] {
    const indices = [];
    for (let j = 0; j < height - 1; j++) {
      for (let i = j * width; i < j * width + width - 1; i++) {
        indices.push(
          i,
          i + width,
          i + 1,

          i + 1,
          i + width,
          i + 1 + width
        );
      }
    }
    return indices;
  }

  private addEventListeners() {
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('mousedown', (event) => this.onMouseDown(event));
    window.addEventListener('mouseup', (event) => this.onMouseUp(event));
    window.addEventListener('mousemove', (event) => this.onMouseMove(event));
  }

  private onKeyDown(event: KeyboardEvent) {
    const speed = 0.1;
    switch (event.key.toLowerCase()) {
      case 'w': this.cameraVelocity.z = -speed; break;
      case 's': this.cameraVelocity.z = speed; break;
      case 'a': this.cameraVelocity.x = -speed; break;
      case 'd': this.cameraVelocity.x = speed; break;
      case 'q': this.cameraVelocity.y = -speed; break;
      case 'e': this.cameraVelocity.y = speed; break;
    }
  }

  private onKeyUp(event: KeyboardEvent) {
    switch (event.key.toLowerCase()) {
      case 'w':
      case 's': this.cameraVelocity.z = 0; break;
      case 'a':
      case 'd': this.cameraVelocity.x = 0; break;
      case 'q':
      case 'e': this.cameraVelocity.y = 0; break;
    }
  }

  private onMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      this.isMouseDown = true;
      this.lastMousePosition = { x: event.clientX, y: event.clientY };
    }
  }

  private onMouseUp(event: MouseEvent) {
    if (event.button === 0) {
      this.isMouseDown = false;
    }
  }

  private onMouseMove(event: MouseEvent) {
    if (this.isMouseDown) {
      const deltaX = event.clientX - this.lastMousePosition.x;
      const deltaY = event.clientY - this.lastMousePosition.y;
      this.cameraRotation.y -= deltaX * 0.002;
      this.cameraRotation.x -= deltaY * 0.002;
      this.lastMousePosition = { x: event.clientX, y: event.clientY };
    }
  }

  private startAnimation() {
    this.renderer.setAnimationLoop(() => this.animate());
  }

  private animate() {
    const elapsed = this.clock.getDelta();

    // Apply camera movement and rotation
    this.camera.position.add(this.cameraVelocity);
    this.camera.rotation.x = this.cameraRotation.x;
    this.camera.rotation.y = this.cameraRotation.y;

    // Rotate the existing cube
    this.cube.rotation.x += (this.rotationspeed + 1) * elapsed;
    this.cube.rotation.y += (this.rotationspeed + 1) * elapsed;

    // Rotate the textured cube
    if (this.texturedCube) {
      this.texturedCube.rotation.y += 0.01;
      this.texturedCube.rotation.x += 0.01;
    }

    // Rotate the directional light around the origin
    if (this.directionalLight) {
      const radius = 20;
      const time = this.clock.getElapsedTime();
      this.directionalLight.position.set(
        radius * Math.cos(time),
        20,
        radius * Math.sin(time)
      );
      this.directionalLight.lookAt(new Vector3(0, 0, 0));
    }

    this.renderer.render(this.scene, this.camera);
  }

  onRotationSpeedChanged(event: Event) {
    const rangeEvent = event as RangeCustomEvent;
    this.rotationspeed = rangeEvent.detail.value as number;
  }
}
