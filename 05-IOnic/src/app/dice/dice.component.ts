import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { PerspectiveCamera, Scene, WebGLRenderer, Clock, AnimationMixer, AmbientLight, DirectionalLight, Mesh, PlaneGeometry, TextureLoader, RepeatWrapping, MeshPhysicalMaterial, BufferGeometry, BufferAttribute, Vector3, PCFSoftShadowMap, MeshStandardMaterial, SphereGeometry, CameraHelper } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

@Component({
  selector: 'app-dice',
  templateUrl: './dice.component.html',
  styleUrls: ['./dice.component.scss'],
})
export class DiceComponent implements OnInit, AfterViewInit {
  @ViewChild('dice', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private scene = new Scene();
  private camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  private renderer!: WebGLRenderer;
  private clock = new Clock();

  private train: any;
  private mixer: any;

  private animationSpeed = 0;
  private targetSpeed = 0;
  private speedTransitionTime = 3;
  private lastSpeedChangeTime = 0;

  private floorPlane!: Mesh;
  private heightMap!: Mesh;

  private world!: CANNON.World;
  private ballBody!: CANNON.Body;
  private directionalLight!: DirectionalLight;

  constructor() { }

  ngOnInit() { }

  ngAfterViewInit() {
    this.initializeRenderer();
    this.setupCamera();
    this.loadTrain();
    this.setupFloorPlane();
    this.setupHeightMap();
    this.setupPhysics();
    this.addEventListeners();
    this.setupLighting();
    this.startAnimation();
  }

  private initializeRenderer() {
    this.renderer = new WebGLRenderer({ canvas: this.canvas.nativeElement, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x99ccff, 1);
    this.renderer.shadowMap.type = PCFSoftShadowMap;  // Set shadow quality
    this.renderer.shadowMap.enabled = true;
  }

  private setupCamera() {
    this.camera.position.set(10, 2, 3);
    this.camera.lookAt(7, 0, -10);
  }

  private loadTrain() {
    const loader = new GLTFLoader();
    loader.load(
      '../../assets/models/train10.glb',
      (gltf) => {
        this.train = gltf.scene;
        this.scene.add(this.train);

        // Enable the train to cast shadows
        this.train.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        if (gltf.animations.length > 0) {
          this.mixer = new AnimationMixer(this.train);
          gltf.animations.forEach((clip) => this.mixer.clipAction(clip).play());
        }
      },
      undefined,
      (error) => {
        console.error('Error loading train model:', error);
      }
    );
  }

  private setupFloorPlane() {
    const loader = new TextureLoader();
    loader.load('assets/textures/sand.png', (diffuseTexture) => {
      loader.load('assets/textures/sandn.png', (normalTexture) => {
        const material = new MeshPhysicalMaterial({
          map: diffuseTexture,
          normalMap: normalTexture,
          roughness: 0.5,
          metalness: 0.1,
        });

        diffuseTexture.wrapS = diffuseTexture.wrapT = RepeatWrapping;
        normalTexture.wrapS = normalTexture.wrapT = RepeatWrapping;
        diffuseTexture.repeat.set(10, 10);
        normalTexture.repeat.set(10, 10);

        const floorGeometry = new PlaneGeometry(100, 100);
        this.floorPlane = new Mesh(floorGeometry, material);
        this.floorPlane.rotation.x = -Math.PI / 2;
        this.floorPlane.position.set(0, 0, 0);

        // Enable the floor to receive shadows
        this.floorPlane.receiveShadow = true;

        this.scene.add(this.floorPlane);
      });
    });
  }

  private setupHeightMap() {
    const loader = new TextureLoader();
    loader.load('assets/maps/heightmap.png', (texture) => {
      texture.wrapS = texture.wrapT = RepeatWrapping;
      this.generateTerrainFromTexture(texture.image as HTMLImageElement);
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
        vertices.push(x - width / 2, y * 10, z - height / 2);
        colors.push(0.5, 0.3 + y * 0.7, 0.2, 1); // Brown to green gradient
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
    geometry.setIndex(this.generateIndices(width, height));

    const material = new MeshPhysicalMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    // Increase the width of the heightmap
    this.heightMap = new Mesh(geometry, material);
    geometry.computeVertexNormals();
    this.heightMap.position.set(11, 0, -30); // Place it behind the train for visual clarity
    this.heightMap.scale.set(4, 1, 1); // Scale it to make it wider
    this.heightMap.receiveShadow = true;

    this.scene.add(this.heightMap);
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
  private setupPhysics() {
    // Initialize the physics world
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0); // Gravity in Y direction

    // Create a floor plane for physics
    const floorShape = new CANNON.Plane();
    const floorBody = new CANNON.Body({
      mass: 0, // Static body
      position: new CANNON.Vec3(0, 0, 0)
    });
    floorBody.addShape(floorShape);
    this.world.addBody(floorBody);

    // Create the ball
    const ballRadius = 0.5;
    const ballShape = new CANNON.Sphere(ballRadius);
    this.ballBody = new CANNON.Body({
      mass: 0.25,
      position: new CANNON.Vec3(10, 6, 1.6),
      velocity: new CANNON.Vec3(0, 0, 0)
    });
    this.ballBody.addShape(ballShape);
    this.world.addBody(this.ballBody);

    const ballGeometry = new SphereGeometry(ballRadius);
    const ballMaterial = new MeshStandardMaterial({ color: 0xff0000 });
    const ballMesh = new Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true;
    ballMesh.receiveShadow = true
    this.scene.add(ballMesh);

    this.world.addEventListener('postStep', () => {
      ballMesh.position.copy(this.ballBody.position);

      if (this.ballBody.position.y <= 0.5) {
        this.ballBody.position.y = 0.5;
        this.ballBody.velocity.y = 0;
      }

      if (this.ballBody.position.x <= 0) {
        this.ballBody.velocity.x = 0;
        this.ballBody.position.x = 0;
      }
    });

  }

  private addEventListeners() {
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === ' ') this.startAccelerating();
  }

  private onKeyUp(event: KeyboardEvent) {
    if (event.key === ' ') this.stopAccelerating();
  }

  private startAccelerating() {
    this.targetSpeed = 1.4;
    this.lastSpeedChangeTime = this.clock.getElapsedTime();
  }

  private stopAccelerating() {
    this.targetSpeed = 0;
    this.lastSpeedChangeTime = this.clock.getElapsedTime();
  }

  private startAnimation() {
    this.renderer.setAnimationLoop(() => this.animate());
  }

  private animate() {
    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    const speedTransitionProgress = (elapsedTime - this.lastSpeedChangeTime) / this.speedTransitionTime;
    const lerpedSpeed = this.lerp(this.animationSpeed, this.targetSpeed, Math.min(speedTransitionProgress, 1));
    this.animationSpeed = lerpedSpeed;

    if (this.mixer) {
      this.mixer.update(delta * this.animationSpeed);
    }

    // Move the floor plane and heightmap to the left
    if (this.floorPlane) {
      const material = this.floorPlane.material as MeshPhysicalMaterial;
      const scrollSpeed = lerpedSpeed * delta * 0.3;

      if (material.map) {
        material.map.offset.x += scrollSpeed;
        if (material.map.offset.x < -1) {
          material.map.offset.x += 1;
        }
      }

      if (material.normalMap) {
        material.normalMap.offset.x += scrollSpeed;
        if (material.normalMap.offset.x < -1) {
          material.normalMap.offset.x += 1;
        }
      }
    }

    if (this.ballBody) {
      const scrollSpeed = lerpedSpeed * delta * 2.5;

      this.ballBody.position.x -= scrollSpeed;

      if (this.ballBody.position.x < -1) {
        this.ballBody.position.x = 1;
      }
    }



    // Rotate the directional light around the train
    if (this.train && this.directionalLight) {
      const radius = 5;
      const speed = 0.5;
      const x = this.train.position.x + radius * Math.sin(elapsedTime * speed);
      const z = this.train.position.z + radius * Math.cos(elapsedTime * speed);
      this.directionalLight.position.set(x, 5, z);
      this.directionalLight.lookAt(this.train.position);
    }

    this.world.step(delta);

    this.renderer.render(this.scene, this.camera);
  }

  private lerp(start: number, end: number, t: number): number {
    return start + t * (end - start);
  }

  private setupLighting() {
    const ambientLight = new AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    this.directionalLight = new DirectionalLight(0xffffff, 2);
    this.directionalLight.position.set(-4, 5, 5);
    this.directionalLight.castShadow = true;

    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;

    this.directionalLight.shadow.camera.near = 1;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -20;
    this.directionalLight.shadow.camera.right = 20;
    this.directionalLight.shadow.camera.top = 20;
    this.directionalLight.shadow.camera.bottom = -20;

    this.scene.add(this.directionalLight);

    // const shadowHelper = new CameraHelper(this.directionalLight.shadow.camera);
    // this.scene.add(shadowHelper);
  }

}
