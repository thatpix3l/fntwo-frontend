<style>

@import "bulma/css/bulma.css";

#ui {
    align-items: flex-start;
}

.vrm-upload-box {
    aspect-ratio: 1/1;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
}

.vrm-file-dialog {
    display: none;
}

.dragged-into {
    outline: 3px dashed hsl(217, 71%, 53%);
}

.section > *{
    flex: 1 1 0px;
}

</style>

<script lang="ts">
// Svelte components
import Button from "lib/svelte/generic/Button.svelte"
import Switch from "lib/svelte/generic/Switch.svelte"
import Tabs from "lib/svelte/generic/Tabs.svelte"
import ValuePreviewer from "lib/svelte/generic/ValuePreviewer.svelte";
import MenuList from "lib/svelte/generic/MenuList.svelte";
import ReceiverOptions from "./unique/ReceiverOptions.svelte";

// TypeScript imports
import * as api from "lib/ts/api"
import type * as config from "lib/ts/models/config"

export let vrmFile: File | undefined
export let sceneConfig: config.Scene | undefined
export let appConfig: config.App | undefined
export let clientConfig: config.Client

let appConfigValue: any
let sceneConfigValue: any

let isDraggedInto: Boolean
let inputElem: HTMLInputElement

const processVRM = (file: File) => {
    vrmFile = file
}

const processDroppedVRM = (ev: DragEvent) => {
    const file = ev.dataTransfer?.files[0]
    file && processVRM(file)
}

const processUploadedVRM = (ev: Event & {currentTarget: EventTarget & HTMLInputElement}) => {
    const file = ev.currentTarget.files?.[0]
    file && processVRM(file)
}

// Current tab name for viewing the current state of the server's configs
let statusTab: string = "App"

// Current tab name for controls
let controlsTab: string = "Model"

const sceneStatus = new api.Status()
const setScene = async () => {

    clearTimeout(sceneStatus.successTimeout)
    sceneStatus.waiting = true

    try {
        await api.SetScene()
        sceneStatus.success = true
    } catch {
        sceneStatus.success = false
    }
    sceneStatus.waiting = false
    
    sceneStatus.successTimeout = setTimeout(() => sceneStatus.success = undefined, 750)

}

</script>

<section id="ui" class="section is-flex is-flex-direction-row">

    <div class="box has-background-light">

        <h1 class="title">
            Status
        </h1>

        <Tabs tabNames={["App", "Scene"]} bind:currentTab={statusTab}/>

        {#if statusTab === "App" && appConfig !== undefined}
        <ValuePreviewer value={appConfigValue}>
            <MenuList name="app config" root={appConfig} bind:value={appConfigValue}/>
        </ValuePreviewer>

        {:else if statusTab === "Scene" && sceneConfig !== undefined}
        <ValuePreviewer value={sceneConfigValue}>
            <MenuList name="scene config" root={sceneConfig} bind:value={sceneConfigValue}/>
        </ValuePreviewer>
    
        {/if}

    </div>

    <div class="empty-space">
    </div>

    <div class="box has-background-light">
        <h1 class="title">Controls</h1>

        <Tabs tabNames={["Model", "App", "Scene"]} bind:currentTab={controlsTab}></Tabs>

        {#if controlsTab === "Scene"}
        <Button success={sceneStatus.success} disabled={sceneStatus.waiting} on:click={setScene}/>

        <div>
            <Switch label="Grid" bind:checked={clientConfig.show_grid} />
        </div>
    
        {:else if controlsTab === "App"}
        <ReceiverOptions />

        {:else if controlsTab === "Model"}
        <div id="model-tab-content">

            <div class="box vrm-upload-box"
                class:dragged-into={ isDraggedInto }
                on:dragenter={() => isDraggedInto = true }
                on:dragleave={() => isDraggedInto = false }
                on:drop={ev => { isDraggedInto = false; processDroppedVRM(ev) }}
                on:click={() => { inputElem.click() }}>

                <p>Drag and drop your <code>vrm</code> file, or click to manually pick!</p>
                <input on:change={processUploadedVRM} class="vrm-file-dialog" bind:this={inputElem} type="file" />

            </div>

        </div>

        {/if}

    </div>

</section>