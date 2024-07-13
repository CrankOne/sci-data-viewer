import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

var camera;
var renderer;
var scene;
var gSceneItems = {'materials': {}, 'items': {}};

function init() {
    scene = new THREE.Scene();
    //console.log(scene);
    camera = new THREE.PerspectiveCamera( 50
        , document.documentElement.clientWidth / document.documentElement.clientHeight
        , 0.1
        , 1000
        );
    renderer = new THREE.WebGLRenderer({alpha: false,});
    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.setSize(
        document.documentElement.clientWidth,
        document.documentElement.clientHeight
    );
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.zIndex = 1;
    renderer.domElement.style.top = 0;
    document.body.appendChild(renderer.domElement);

    var pointLight = new THREE.PointLight(0x888888);
    pointLight.position.set(1, 1, 1);
    scene.add(pointLight);

    camera.position.set(5, 5, -10); // x y z
    camera.lookAt(0, 0, 0);

    function render() {
        //requestAnimationFrame(render);
        renderer.render(scene, camera);
    }
    controls.addEventListener( 'change', render );
    render();

    /*
    var detectors = [
        {
          id: "det1",
          type: "rect1DWiredPlane",
          position: [0, 0, -1],
          sizes: [0.75, 1.75, 0.1],
          rotation: [0, 12, 6.5],
        },
        {
          id: "det2",
          type: "rect1DWiredPlane",
          position: [0, 0, 1],
          sizes: [1.5, 0.83, 0.05],
          rotation: [-3.4, 0, -4.5],
        },
        {
          id: "det3",
          type: "rect1DWiredPlane",
          position: [0, 0, 0],
          sizes: [1.4, 1.4, 0.05],
          rotation: [0, 0, 0],
        },
        // ...
    ];

  const detMaterial = new THREE.MeshBasicMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.15,
    color: 0xffffaa,
  });
  detectors.forEach((detItem) => {
    if (detItem.type == "rect1DWiredPlane") {
      const geometry = new THREE.BoxGeometry(
        detItem.sizes[0],
        detItem.sizes[1],
        detItem.sizes[2]
      );
      const detMesh = new THREE.Mesh(geometry, detMaterial);
      scene.add(detMesh);
      detMesh.position.set(
        detItem.position[0],
        detItem.position[1],
        detItem.position[2]
      );
      detMesh.eulerOrder = "ZYX";
      detMesh.rotation.set(
        (detItem.rotation[0] * Math.PI) / 180,
        (detItem.rotation[1] * Math.PI) / 180,
        (detItem.rotation[2] * Math.PI) / 180
      );
      console.log(`Placed ${detItem.id}`);
    } else {
      console.error(`Unknown det type ${detItem.type}`);
    }
  });

  //
  // Reference track

  const refTrackPoints = [
    [-0.15, 0.56, -2],
    [0.23, -0.3, 2],
  ];
  const refTrackPointsVecs = [];
  refTrackPoints.forEach((cs) => {
    refTrackPointsVecs.push(new THREE.Vector3(cs[0], cs[1], cs[2]));
  });
  const refTrackMaterial = new THREE.LineDashedMaterial({
    color: 0xff7777,
    linewidth: 1,
    scale: 1,
    dashSize: 3,
    gapSize: 1,
  });
  const refTrackGeo = new THREE.BufferGeometry().setFromPoints(
    refTrackPointsVecs
  );
  const line = new THREE.Line(refTrackGeo, refTrackMaterial);
  scene.add(line);
    */
}

function emplace_renderables(scene, sceneData) {
    sceneData.materials.forEach((materialData_) => {
        const { _type: matType
            , _name: matName
            , ...materialData
            } = materialData_;
        var cls; // = THREE[matName];
        if('MeshBasicMaterial' == matType) {
            cls = THREE.MeshBasicMaterial;
        } else if('LineDashedMaterial' == matType) {
            cls = THREE.LineDashedMaterial;
        }
        // ... other materials
        else {
            throw new Error(`Inknown material type ${matType}`);
        }
        gSceneItems.materials[matName] = new cls(materialData);
    });
    sceneData.geometry.forEach((geometryItem_) => {
        const { _type: geometryType
              , _name: name
              , _material: materialName
              , ...geometryItem
              } = geometryItem_;
        var geometry;
        var isMesh = true;
        if('BoxGeometry' == geometryType) {
            geometry = new THREE.BoxGeometry(...geometryItem.sizes);
        } else if('Line' == geometryType) {
            const refPointVecs = geometryItem.points.map((pt) => new THREE.Vector3(...pt));
            const refTrackGeo
                = new THREE.BufferGeometry().setFromPoints(refPointVecs);
            const line = new THREE.Line(refTrackGeo, gSceneItems.materials[materialName]);
            isMesh = false;
            scene.add(line);
            gSceneItems.items[name] = {'geometry':geometry, 'mesh': line};
        }
        // ... other primitives
        else {
            throw new Error(`Inknown geometry type ${type}`);
        }
        if(isMesh) {
            const mesh = new THREE.Mesh(geometry, gSceneItems.materials[materialName]);
            scene.add(mesh);
            gSceneItems.items[name] = {'geometry':geometry, 'mesh': mesh};
            mesh.position.set(...geometryItem.position);
            //mesh.eulerOrder = "ZYX";
            mesh.rotation.order = "ZYX";  // TODO
            mesh.rotation.set(...geometryItem.rotation.map((v) => v*Math.PI/180.));
        }
    });
}

init();
fetch('/scene')
    .then(response => response.json())
    .then((sceneData) => {
        emplace_renderables(scene, sceneData)
    })
    .then(() => { renderer.render(scene, camera); })
    .catch((error) => console.error(error));

function resize() {
    camera.aspect = document.documentElement.clientWidth
                  / document.documentElement.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( document.documentElement.clientWidth
                    , document.documentElement.clientHeight
                    );
}

window.addEventListener("resize", resize, false);

