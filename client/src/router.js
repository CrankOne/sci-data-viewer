import { createRouter, createWebHashHistory } from "vue-router";
import ThreeViewer from "@/components/ThreeViewer.vue";

export default function create_router() {
    return createRouter({
        history: createWebHashHistory(),
        routes: [
            {
                path: "/",
                redirect: {name: "three-view"}
            },
            {
                path: "/three-view/",
                name: "three-view",
                component: ThreeViewer,
                props: {
                    // ...
                }
            }
        ]
    });
}
