import * as THREE from "three";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import { GLTFNode, VRM, VRMSchema } from '@pixiv/three-vrm';
import CameraControls from 'camera-controls';
import * as TYPINGS from "./typings";

// Document styling
document.body.style.margin = "0";
document.body.style.padding = "0";

// WebGL Renderer
const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Main scene
const clock: THREE.Clock = new THREE.Clock();
const mainScene: THREE.Scene = new THREE.Scene();

// Lighting
const light = new THREE.PointLight(0xffffff, 1, 100);
light.position.set(5, 20, 5);
mainScene.add(light);

// Camera
const main_camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 1000);
main_camera.position.set(0, 2, -2); // For some reason, the camera-controls library doesn't work unless I manually set the camera position

// Camera controls
CameraControls.install({ THREE: THREE }); // Prequisite for using camera-controls package
const main_camera_controls: CameraControls = new CameraControls(main_camera, renderer.domElement);
const camera_velocity: number = 0.1;

// Camera transformation vars to help when user decides to manually change camera positioning
let live_camera_data: TYPINGS.cameraPayload;
let camera_ws: WebSocket;

// WebSocket handler for reading in the current state of the camera
const camera_transform_sock = (ws_url: string) => {

    console.log("Attempting to create a new camera WebSocket...");

    camera_ws = new WebSocket(ws_url);

    camera_ws.onopen = (ev) => {
        console.log("Successfully connected to camera transformation socket!");
    };

    // Callback for handling received camera transformation data
    camera_ws.onmessage = process_camera_payload;

    camera_ws.onclose = function (ev) {
        console.log('Socket is closed. Reconnect will be attempted in 1 second.', ev.reason);
        setTimeout(function () {
            camera_transform_sock(ws_url);
        }, 1000);
    };

    camera_ws.onerror = function (ev) {
        console.error('Socket encountered error:', ev, 'Closing socket');
        camera_ws.close();
    };

}

camera_transform_sock("ws://127.0.0.1:3579/api/camera");

// Get the current positioning and rotation of a given camera, send it to given WebSocket
const send_camera_data = (camera_controls: CameraControls) => {
    console.log("Sending current scene's camera data to backend...");

    let target_vect: THREE.Vector3;
    let camera_vect: THREE.Vector3;
    target_vect = camera_controls.getTarget(target_vect)
    camera_vect = camera_controls.getPosition(camera_vect)

    // Var for storing current camera position and rotation
    let new_camera_data: TYPINGS.cameraPayload = {
        position: {
            x: camera_vect.x,
            y: camera_vect.y,
            z: camera_vect.z
        },
        target: {
            x: target_vect.x,
            y: target_vect.y,
            z: target_vect.z
        }
    }

    // Send camera data to backend
    camera_ws.send(JSON.stringify(new_camera_data));

}

// Every time the camera stops being moved by the user, send the current camera coords
main_camera_controls.addEventListener('controlend', () => {
    send_camera_data(main_camera_controls);
});

// Keyboard input event listeners, to remove delay
let keyState: { [keyName: string]: boolean } = {};

document.addEventListener('keydown', (ev) => {
    keyState[ev.key] = true;
}, true);

document.addEventListener('keyup', (ev) => {
    keyState[ev.key] = false;
}, true);

// Camera controls wrapper
const modify_camera = () => {

    // Keyboard Controls for camera
    if (keyState["a"]) {
        main_camera_controls.truck(-camera_velocity, 0, false);
    }

    if (keyState["d"]) {
        main_camera_controls.truck(camera_velocity, 0, false);
    }

    if (keyState["w"]) {
        main_camera_controls.forward(camera_velocity, false);
    }

    if (keyState["s"]) {
        main_camera_controls.forward(-camera_velocity, false);
    }

    // Update camera position
    const delta = clock.getDelta();
    main_camera_controls.update(delta);

}

// Rendering loop
const animate = () => {

    // Check for camera changes, update it
    modify_camera();

    try {
        vrmModel.blendShapeProxy.update()
    } catch (e) { }

    // Render scene
    requestAnimationFrame(animate);

    renderer.render(mainScene, main_camera);

};
animate();

// Grid
const size = 10;
const divisions = 10;
const gridHelper = new THREE.GridHelper(size, divisions);
mainScene.add(gridHelper);

// Reference to VRM character model
let vrmModel: VRM;

// Model loader
const load_model = (model_path: string) => {

    // Load model using GLTF
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(model_path, async (gltf) => {

        // Create and store VRM representation from loaded GLTF
        vrmModel = (await VRM.from(gltf));

        // Add VRM to scene       
        mainScene.add(vrmModel.scene);

    },
        (progress) => console.log(progress),
        (error) => console.error(error));

};

// Process and use VRM payload from a given message event
const process_vrm_payload = (ev: MessageEvent<any>) => {

    // Assume given data is of type vrmPayload
    const new_vrm: TYPINGS.vrmPayload = JSON.parse(ev.data);

    try {

        // Attempt to update blend shapes
        for (const key of Object.keys(new_vrm.blend_shapes.face)) {
            vrmModel.blendShapeProxy.setValue("BlendShape." + key, new_vrm.blend_shapes.face[key])
        }

        // For each name of all bones available in the VRMSchema, update with new data equivalent from backend
        for (const key of Object.keys(new_vrm.bones)) {

            // Get the GLTF 3D object to manipulate
            const model_bone: GLTFNode = vrmModel.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[key]);

            // Store reference to the equivalent key with new transformations
            const new_bone: TYPINGS.payloadSingleBone = new_vrm.bones[key];

            // Create new quaternion to rotate towards, based off of new_bone transformations
            const target_rotation = new THREE.Quaternion(
                -new_bone.rotation.quaternion.x,
                new_bone.rotation.quaternion.y,
                new_bone.rotation.quaternion.z,
                new_bone.rotation.quaternion.w,
            );

            // Rotate bone
            model_bone.quaternion.slerp(target_rotation, .5);

        }

    } catch (e) {

    }

}

const process_camera_payload = (ev: MessageEvent<any>) => {
    console.log("Updating scene's camera data from backend...");

    live_camera_data = JSON.parse(ev.data);

    main_camera_controls.setLookAt(
        live_camera_data.position.x,
        live_camera_data.position.y,
        live_camera_data.position.z,
        live_camera_data.target.x,
        live_camera_data.target.y,
        live_camera_data.target.z,
        true,
    );

}

// WebSocket handler for communicating with internal API for VRM transformations
const model_tracking_sock = (ws_url: string) => {

    let ws = new WebSocket(ws_url);

    ws.onopen = (ev) => {
        console.log("Successfully connected to model tracking WebSocket!");
    };

    // Callback for handling VRM transformation data
    ws.onmessage = process_vrm_payload;

    ws.onclose = function (ev) {
        console.log('Socket is closed. Reconnect will be attempted in 1 second.', ev.reason);
        setTimeout(function () {
            model_tracking_sock(ws_url);
        }, 1000);
    };

    ws.onerror = function (ev) {
        console.error('Socket encountered error:', ev, 'Closing socket');
        ws.close();
    };

};

// Load VRM model
load_model("/bruh.vrm");

// Read in VRM model positioning data
model_tracking_sock("ws://127.0.0.1:3579/api/model");