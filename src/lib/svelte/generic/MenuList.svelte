<style>

@import "bulma/css/bulma.css";

</style>

<script lang="ts">
import RecursiveList from "lib/svelte/generic/RecursiveList.svelte"

export let name: string
export let root: {[key: string]: any}
export let value: any

</script>
    
<aside class="menu">
    <p class="menu-label">{name}</p>
    <RecursiveList root={root} bind:value/>
</aside>