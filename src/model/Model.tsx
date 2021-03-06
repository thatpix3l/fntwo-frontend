import * as THREE from "three";
import {GLTFLoader} from "three-stdlib";
import { VRM, VRMSchema } from '@pixiv/three-vrm';
import CameraControls from 'camera-controls';
import { camera, vrm, bone }from "../types";
import { addressPrefix } from "../typings";

export const start = async (keyState: { [keyName: string]: boolean }, backendAddr: addressPrefix) => {

    // Root element to mount canvas for model
    const model_elem_root = document.getElementById("model-root")!;

    // WebGL Renderer
    const renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    model_elem_root.appendChild(renderer.domElement);

    // Main scene
    const clock: THREE.Clock = new THREE.Clock();
    const mainScene: THREE.Scene = new THREE.Scene();

    // Lighting
    const light = new THREE.PointLight(0xffffff, 1, 100);
    light.position.set(5, 20, 5);
    mainScene.add(light);

    // Camera
    const main_camera: THREE.PerspectiveCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    main_camera.position.set(0, 2, -2); // For some reason, the camera-controls library doesn't work unless I manually set the camera position

    // Camera controls
    CameraControls.install({ THREE: THREE }); // Prequisite for using camera-controls package
    const main_camera_controls: CameraControls = new CameraControls(main_camera, renderer.domElement);
    const camera_velocity: number = 0.1;

    // Camera transformation vars to help when user decides to manually change camera positioning
    let live_camera_data: camera;
    let camera_ws: WebSocket;

    const process_camera_payload = (ev: MessageEvent<any>) => {
        console.log("Updating scene's camera data from backend...");

        live_camera_data = JSON.parse(ev.data);

        main_camera_controls.setLookAt(
            live_camera_data.gaze_from.x,
            live_camera_data.gaze_from.y,
            live_camera_data.gaze_from.z,
            live_camera_data.gaze_towards.x,
            live_camera_data.gaze_towards.y,
            live_camera_data.gaze_towards.z,
            true,
        );

    }

    // WebSocket handler for reading in the current state of the camera
    const camera_transform_sock = (ws_url: string) => {

        console.log("Attempting to create a new viewport camera WebSocket...");

        camera_ws = new WebSocket(ws_url);

        camera_ws.onopen = (ev) => {
            console.log("Successfully connected to viewport camera WebSocket!");
        };

        // Callback for handling received camera transformation data
        camera_ws.onmessage = process_camera_payload;

        camera_ws.onclose = function (ev) {
            console.log('Closed viewport camera WebSocket. Reconnect will be attempted in 1 second.', ev.reason);
            setTimeout(function () {
                camera_transform_sock(ws_url);
            }, 1000);
        };

        camera_ws.onerror = function (ev) {
            console.error('Socket encountered error:', ev, 'Closing socket');
            camera_ws.close();
        };

    }

    camera_transform_sock(backendAddr.urlWS() + "/client/camera");

    // Get the current positioning and rotation of a given camera, send it to given WebSocket
    const send_camera_data = (camera_controls: CameraControls) => {
        console.log("Sending current scene's camera data to backend...");

        let target_vect = new THREE.Vector3;
        let camera_vect = new THREE.Vector3;
        target_vect = camera_controls.getTarget(target_vect);
        camera_vect = camera_controls.getPosition(camera_vect);

        // Var for storing current camera position and rotation
        let new_camera_data: camera = {
            gaze_from: {
                x: camera_vect.x,
                y: camera_vect.y,
                z: camera_vect.z
            },
            gaze_towards: {
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

    }

    // Rendering loop
    const animate = () => {

        const delta = clock.getDelta();

        // Check for camera changes, update it
        modify_camera();

        // Update camera position
        main_camera_controls.update(delta);

        try {

            // Update blend shapes
            vrmModel.blendShapeProxy?.update()

            // Update spring bones
            vrmModel.springBoneManager?.lateUpdate(delta);

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

    // Reference to VRM character model
    let vrmModel: VRM;

    // Model loader
    const load_model = (model_path: string) => {

        // Prune existing model, first
        if(vrmModel !== undefined) {
            mainScene.remove(vrmModel.scene);
        }

        // Load model using GLTF
        const gltfLoader = new GLTFLoader();
        gltfLoader.load(model_path, async (gltf) => {

            // Create and store VRM representation from loaded GLTF
            // @ts-ignore
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
        const new_vrm: vrm = JSON.parse(ev.data);

        try {

            // Attempt to update blend shapes
            for (const key of Object.keys(new_vrm.blend_shapes)) {
                vrmModel.blendShapeProxy?.setValue("BlendShape." + key, new_vrm.blend_shapes[key])
            }

            // For each name of all bones available in the VRMSchema, update with new data equivalent from backend
            for (const key of Object.keys(new_vrm.bones)) {

                // Get the GLTF 3D object to manipulate
                // @ts-ignore
                const schema_bone = VRMSchema.HumanoidBoneName[key];
                const model_bone = vrmModel.humanoid?.getBoneNode(schema_bone);

                // Store reference to the equivalent key with new transformations
                const new_bone: bone = new_vrm.bones[key];

                // Create new quaternion to rotate towards, based off of new_bone transformations
                const target_rotation = new THREE.Quaternion(
                    -new_bone.rotation.x,
                    new_bone.rotation.y,
                    new_bone.rotation.z,
                    new_bone.rotation.w,
                );

                // Rotate bone
                model_bone?.quaternion.slerp(target_rotation, .5);

            }

        } catch (e) {

        }

    }

    // WebSocket handler for communicating with internal API for VRM transformations
    const model_tracking_sock = (ws_url: string) => {

        console.log("Attempting to create a new model tracking WebSocket...");

        let ws = new WebSocket(ws_url);

        ws.onopen = (ev) => {
            console.log("Successfully connected to model tracking WebSocket!");
        };

        // Callback for handling VRM transformation data
        ws.onmessage = process_vrm_payload;

        ws.onclose = function (ev) {
            console.log('Closed model tracking WebSocket. Reconnect will be attempted in 1 second.', ev.reason);
            setTimeout(function () {
                model_tracking_sock(ws_url);
            }, 1000);
        };

        ws.onerror = function (ev) {
            console.error('Encountered error with model tracking WebSocket:', ev, 'Closing socket');
            ws.close();
        };

    };

    // Load default VRM model
    load_model(backendAddr.url() + "/api/model");

    // Read in VRM model positioning data
    model_tracking_sock(backendAddr.urlWS() + "/client/model");
}