<script lang="ts">

import { onMount } from "svelte"
import * as three from "three"
import CameraControls from "camera-controls"
import * as threeVRM from "@pixiv/three-vrm"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

import type * as object from "lib/ts/models/object"
import * as helper from "lib/ts/helper"
import type * as config from "lib/ts/models/config";

export let rendererWidth: number = 1920
export let rendererHeight: number = 1080
export let cameraVelocity = 0.1
export let vrmTransformation: object.VRM | undefined
export let inputCamera: object.Camera | undefined
export let outputCamera: object.Camera
export let vrmFileURL: string
export let clientConfig: config.Client

// Key listener
const keyListener = new helper.KeyListener()

// Root element of model viewer
let viewerRoot: HTMLElement

// WebGL renderer
const renderer = new three.WebGLRenderer({alpha: true, antialias: true})
renderer.setPixelRatio(window.devicePixelRatio)
$: renderer.setSize(rendererWidth, rendererHeight)
onMount(() => {
    viewerRoot.appendChild(renderer.domElement)
})

// Main ThreeJS 3D scene
const modelScene = new three.Scene()

// 3D grid
const gridHelper = new three.GridHelper(10, 10)
modelScene.add(gridHelper)

$: {
    gridHelper.visible = clientConfig.show_grid
}

// ThreeJS camera
const sceneCamera = new three.PerspectiveCamera(70, rendererWidth/rendererHeight, 0.1, 1000)
$: {
    sceneCamera.aspect = rendererWidth / rendererHeight
    sceneCamera.updateProjectionMatrix()
}
sceneCamera.position.set(0, 2, -2) // For some reason, the camera-controls library doesn't work unless I manually set the  camera position

// Camera controls, for easier translation and rotation
CameraControls.install({THREE: three}) // Prequisite for using camera-controls package
const cameraControl = new CameraControls(sceneCamera, renderer.domElement)

// Update model viewer camera everytime inputCamera gets assigned
$: {
    if(inputCamera !== undefined) {
        cameraControl.setLookAt(
            inputCamera.gaze_from.x,
            inputCamera.gaze_from.y,
            inputCamera.gaze_from.z,
            inputCamera.gaze_towards.x,
            inputCamera.gaze_towards.y,
            inputCamera.gaze_towards.z,
            true
        )
    }
}

// Lighting
const light = new three.PointLight(0xffffff, 1, 100)
light.position.set(5, 20, 5);
modelScene.add(light)

const updateOutputCamera = () => {

    //@ts-ignore
    const position = cameraControl.getPosition()
    //@ts-ignore
    const target = cameraControl.getTarget()

    outputCamera = {
        gaze_from: {
            x: position.x,
            y: position.y,
            z: position.z
        },
        gaze_towards: {
            x: target.x,
            y: target.y,
            z: target.z
        }
    }
    
}

// Set controls for moving camera
keyListener.OnPress("w", () => { cameraControl.forward(cameraVelocity, false) })
keyListener.OnPress("a", () => { cameraControl.truck(-cameraVelocity, 0, false) })
keyListener.OnPress("s", () => { cameraControl.forward(-cameraVelocity, false) })
keyListener.OnPress("d", () => { cameraControl.truck(cameraVelocity, 0, false) })

// Update camera output when camera is done controlled with mouse and keyboard
cameraControl.addEventListener("controlend", () => updateOutputCamera())
const keys = ["w", "a", "s", "d"]
keys.map((key) => keyListener.OnRelease(key, () => updateOutputCamera()))

// VRM model loading, clearing and other related stuff
let vrmModel: threeVRM.VRM

const loadVRM = (url: string) => {

    if(vrmModel) {
        modelScene.remove(vrmModel.scene)
    }

    const gltfLoader = new GLTFLoader()
    gltfLoader.load(url, async gltf => {

        vrmModel = await threeVRM.VRM.from(gltf)
        modelScene.add(vrmModel.scene)

        URL.revokeObjectURL(url)

    },
    progress => console.log(progress),
    error => console.error(error)
    )

};

$: {
    vrmFileURL && loadVRM(vrmFileURL)
}

const transformVRM = (updatedVRM: object.VRM) => {
    
    if(vrmModel === undefined) {
        return
    }

    // Update blend shapes of VRM model
    for(const key of Object.keys(updatedVRM.blend_shapes)) {

        helper.disableWarn(() => {
            vrmModel.blendShapeProxy?.setValue(`BlendShape.${key}`, updatedVRM.blend_shapes[key])
        })

    }

    // Update bones of VRM model
    for(const boneName of Object.keys(updatedVRM.bones)) {
    
        const humanoidBoneName = threeVRM.VRMSchema.HumanoidBoneName[boneName as keyof typeof threeVRM.VRMSchema.HumanoidBoneName]

        const inputBone = updatedVRM.bones[boneName]
        const modelBone = vrmModel.humanoid?.getBoneNode(humanoidBoneName)
        
        modelBone?.quaternion.set(
            inputBone.rotation.quaternion.x,
            inputBone.rotation.quaternion.y,
            inputBone.rotation.quaternion.z,
            inputBone.rotation.quaternion.w,
        )

    }

};
$: {
    vrmTransformation && transformVRM(vrmTransformation)
}

// Animation loop
const clock = new three.Clock()
export const animationLoop = () => {

    // Update camera position
    const delta = clock.getDelta()
    cameraControl.update(delta)

    try {
        // Update blend shapes
        vrmModel.blendShapeProxy?.update()

        // Update spring bones
        vrmModel.springBoneManager?.lateUpdate(delta)
    } catch {}

    // Render scene
    renderer.render(modelScene, sceneCamera)

};

</script>

<div bind:this={viewerRoot}></div>