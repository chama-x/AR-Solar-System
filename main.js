import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

// --- Global Data & State ---
const PLANET_DATA = [
    { name: "Sun", color: 0xFFD700, size: 0.08, orbit: 0, speed: 0, fact: "The star at the center of our Solar System.", dia: "1.39M km", time: "n/a", emissive: true },
    { name: "Mercury", color: 0x8B8B8B, size: 0.012, orbit: 0.15, speed: 0.04, fact: "The smallest and fastest planet.", dia: "4,879 km", time: "88 days" },
    { name: "Venus", color: 0xE3BB76, size: 0.02, orbit: 0.22, speed: 0.015, fact: "The hottest planet in our solar system.", dia: "12,104 km", time: "225 days" },
    { name: "Earth", color: 0x2B82C9, size: 0.022, orbit: 0.3, speed: 0.01, fact: "The only known planet to support life.", dia: "12,742 km", time: "365.25 days" },
    { name: "Mars", color: 0xC1440E, size: 0.015, orbit: 0.4, speed: 0.008, fact: "Known as the Red Planet.", dia: "6,779 km", time: "687 days" },
    { name: "Jupiter", color: 0xD39C7E, size: 0.05, orbit: 0.55, speed: 0.002, fact: "The largest planet, composed mostly of gas.", dia: "139,820 km", time: "12 years" },
    { name: "Saturn", color: 0xEAD6B8, size: 0.04, orbit: 0.7, speed: 0.0009, fact: "Famous for its prominent ring system.", dia: "116,460 km", time: "29 years", hasRing: true },
    { name: "Uranus", color: 0x4B70DD, size: 0.025, orbit: 0.85, speed: 0.0004, fact: "Rotates on its side.", dia: "50,724 km", time: "84 years" },
    { name: "Neptune", color: 0x274687, size: 0.024, orbit: 1.0, speed: 0.0001, fact: "The windiest planet.", dia: "49,244 km", time: "165 years" }
];

let camera, scene, renderer;
let hitTestSource = null;
let hitTestSourceRequested = false;
let reticle;
let solarSystemGroup = null; // Holds the entire solar system
let planets = []; // Array of mesh objects for animation/raycasting

// UI Elements
const ui = {
    startScreen: document.getElementById('start-screen'),
    loadingContainer: document.getElementById('loading-container'),
    arButtonContainer: document.getElementById('ar-button-container'),
    launchIosBtn: document.getElementById('launch-ios-btn'),
    arWarning: document.getElementById('ar-warning'),
    statusBar: document.getElementById('status-bar'),
    statusText: document.getElementById('status-text'),
    pulseDot: document.querySelector('.pulse-dot'),
    trackingPrompt: document.getElementById('tracking-prompt'),
    trackingPromptText: document.getElementById('tracking-prompt-text'),
    instructions: document.getElementById('ar-instructions'),
    controls: document.getElementById('controls'),
    infoCard: document.getElementById('info-card'),
    pName: document.getElementById('planet-name'),
    pFact: document.getElementById('planet-fact'),
    pDia: document.getElementById('planet-diameter'),
    pOrbit: document.getElementById('planet-orbit')
};

init();

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Dim ambient light to make the sun pop
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    document.body.appendChild(renderer.domElement);

    // Variant Launch Initialization
    window.addEventListener('vlaunch-initialized', (event) => {
        ui.loadingContainer.style.display = 'none';
        const { launchRequired, webXRStatus } = event.detail;

        if (webXRStatus === 'supported') {
            ui.arButtonContainer.classList.remove('hidden');
            setupNativeAR();
        } else if (webXRStatus === 'launch-required' || launchRequired) {
            ui.launchIosBtn.classList.remove('hidden');
            ui.launchIosBtn.addEventListener('click', () => {
                window.location.href = VLaunch.getLaunchUrl(window.location.href);
            });
        } else {
            showARUnavailable();
        }
    });

    setTimeout(() => {
        if (ui.loadingContainer.style.display !== 'none' && !window.VLaunch) {
            showARUnavailable();
        }
    }, 5000);

    setupReticle();
    window.addEventListener('resize', onWindowResize);
}

function setupNativeAR() {
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['local', 'hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') }
    });
    ui.arButtonContainer.appendChild(arButton);

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    renderer.xr.addEventListener('sessionstart', onSessionStart);
    renderer.xr.addEventListener('sessionend', onSessionEnd);
    document.addEventListener('vlaunch-ar-tracking', handleTrackingQuality);

    renderer.setAnimationLoop(animate);
    setupUIControls();
    setupRaycaster();
}

function showARUnavailable() {
    ui.loadingContainer.style.display = 'none';
    ui.arWarning.style.display = 'block';
}

function setupReticle() {
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
}

// --- Logic ---

function onSelect() {
    if (reticle.visible && !solarSystemGroup) {
        if (!ui.instructions.classList.contains('hidden')) {
            ui.instructions.classList.add('hidden');
        }
        spawnSolarSystem(reticle.matrix);
        if (navigator.vibrate) navigator.vibrate(20);
    }
}

function spawnSolarSystem(matrix) {
    solarSystemGroup = new THREE.Group();
    
    // Sun Light
    const sunLight = new THREE.PointLight(0xffffff, 3, 2);
    solarSystemGroup.add(sunLight);

    PLANET_DATA.forEach((data, index) => {
        // Create pivot group for rotation
        const pivot = new THREE.Group();
        
        const geometry = new THREE.SphereGeometry(data.size, 32, 32);
        
        // Sun is emissive, others are standard
        const materialOpts = { color: data.color };
        if (data.emissive) {
            materialOpts.emissive = data.color;
            materialOpts.emissiveIntensity = 0.5;
            materialOpts.basic = true;
        } else {
            materialOpts.roughness = 0.6;
            materialOpts.metalness = 0.1;
        }

        const material = data.emissive 
            ? new THREE.MeshBasicMaterial(materialOpts)
            : new THREE.MeshStandardMaterial(materialOpts);

        const planet = new THREE.Mesh(geometry, material);
        planet.position.x = data.orbit;
        
        // Attach metadata for raycasting info
        planet.userData = data;

        // Add rings to Saturn
        if (data.hasRing) {
            const ringGeo = new THREE.RingGeometry(data.size * 1.5, data.size * 2.2, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xD3C4A5, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2.5; // Tilt
            planet.add(ring);
        }

        // Draw orbital path (faint circle)
        if (data.orbit > 0) {
            const pathGeo = new THREE.RingGeometry(data.orbit - 0.002, data.orbit + 0.002, 64);
            const pathMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.1 });
            const path = new THREE.Mesh(pathGeo, pathMat);
            path.rotation.x = Math.PI / 2;
            solarSystemGroup.add(path);
        }

        pivot.add(planet);
        
        // Randomize initial starting point on orbit
        pivot.rotation.y = Math.random() * Math.PI * 2;
        
        solarSystemGroup.add(pivot);
        
        // Store reference for animation loop and raycasting
        planets.push({ pivot, planet, speed: data.speed });
    });

    solarSystemGroup.position.setFromMatrixPosition(matrix);
    
    // Slight overall tilt to the system
    solarSystemGroup.rotation.z = Math.PI / 24;

    scene.add(solarSystemGroup);
}

// Raycasting to tap planets
function setupRaycaster() {
    renderer.domElement.addEventListener('touchend', (e) => {
        if (!solarSystemGroup || e.changedTouches.length !== 1) return;
        
        const touch = e.changedTouches[0];
        const mouse = new THREE.Vector2(
            (touch.pageX / window.innerWidth) * 2 - 1,
            -(touch.pageY / window.innerHeight) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        
        // Raycast against the actual planet meshes
        const meshList = planets.map(p => p.planet);
        const intersects = raycaster.intersectObjects(meshList);
        
        if (intersects.length > 0) {
            const hitPlanet = intersects[0].object;
            const data = hitPlanet.userData;
            
            // Show Info Card
            ui.pName.innerText = data.name;
            ui.pFact.innerText = data.fact;
            ui.pDia.innerText = data.dia;
            ui.pOrbit.innerText = data.time;
            
            ui.infoCard.classList.remove('hidden');
            
            // Highlight effect
            const oldEmi = hitPlanet.material.emissive ? hitPlanet.material.emissive.getHex() : 0x000000;
            if (!data.emissive) {
                hitPlanet.material.emissive = new THREE.Color(0x333333);
                setTimeout(() => { hitPlanet.material.emissive = new THREE.Color(oldEmi); }, 300);
            }
            
            if (navigator.vibrate) navigator.vibrate(10);
        } else {
            // Tap empty space = hide card
            ui.infoCard.classList.add('hidden');
        }
    });
}

// --- Lifecycle ---

function onSessionStart() {
    ui.startScreen.style.display = 'none';
    setTimeout(() => {
        ui.statusBar.classList.remove('hidden');
        ui.instructions.classList.remove('hidden');
        ui.controls.classList.remove('hidden');
        updateStatus("Scanning for surfaces...", "scanning");
    }, 500);
}

function onSessionEnd() {
    ui.startScreen.style.display = 'flex';
    ui.statusBar.classList.add('hidden');
    ui.instructions.classList.add('hidden');
    ui.controls.classList.add('hidden');
    ui.trackingPrompt.classList.add('hidden');
    ui.infoCard.classList.add('hidden');
    reticle.visible = false;
}

function handleTrackingQuality(event) {
    const state = event.detail.state;
    if (state === 'normal') {
        ui.trackingPrompt.classList.add('hidden');
    } else {
        ui.trackingPrompt.classList.remove('hidden');
        switch (state) {
            case 'limited-excessive-motion': ui.trackingPromptText.innerText = "Moving too fast. Slow down."; break;
            case 'limited-initializing': ui.trackingPromptText.innerText = "Initializing AR Tracking..."; break;
            case 'limited-insufficient-features': ui.trackingPromptText.innerText = "Point at a textured flat surface."; break;
            case 'limited-relocalizing': ui.trackingPromptText.innerText = "Relocalizing... hold still."; break;
            case 'not-available': ui.trackingPromptText.innerText = "Tracking lost."; break;
        }
    }
}

// --- Render Loop ---

function animate(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            
            // Only show reticle if we haven't spawned the system yet
            if (hitTestResults.length > 0 && !solarSystemGroup) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
                updateStatus("Surface found. Tap to place Solar System.", "ready");
            } else {
                reticle.visible = false;
                if (!solarSystemGroup) {
                    updateStatus("Scanning for flat surfaces...", "scanning");
                }
            }
        }
    }

    // Animate Planets
    if (solarSystemGroup) {
        planets.forEach(p => {
            // Orbit rotation around sun
            p.pivot.rotation.y += p.speed;
            
            // Local rotation of the planet itself
            p.planet.rotation.y += 0.01;
        });
    }

    renderer.render(scene, camera);
}

// --- Helpers ---

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateStatus(text, state) {
    if (ui.statusText.innerText !== text) {
        ui.statusText.innerText = text;
        ui.pulseDot.className = 'pulse-dot ' + state;
    }
}

function setupUIControls() {
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (solarSystemGroup) {
            scene.remove(solarSystemGroup);
            solarSystemGroup = null;
            planets = [];
            ui.infoCard.classList.add('hidden');
            if (!ui.statusBar.classList.contains('hidden')) {
                ui.instructions.classList.remove('hidden');
                updateStatus("Scanning for surfaces...", "scanning");
            }
            if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
        }
    });
}
