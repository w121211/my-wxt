import { mount } from "svelte";
// import Panel from "./App.svelte";
import App from "./App.svelte";

// The target element is guaranteed to exist by the index.html file
const target = document.getElementById("app")!;

const app = mount(App, { target });

export default app;
