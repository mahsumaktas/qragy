import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const app = mount(App, { target: document.getElementById("app") });
window.__ADMIN_V2__ = "2.1";

export default app;
