import { createRouter, createWebHashHistory } from "vue-router";
import ViewerPage from "@/components/ViewerPage.vue";

export default function create_router() {
    return createRouter({
        history: createWebHashHistory(),
        routes: [
            {path: "/", name: "viewer", component: ViewerPage}
        ]
    });
}
