import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import Game from "./game.js";

const THREEImpl = {
    ...THREE,
    EffectComposer,
    OutputPass,
    RenderPass,
    UnrealBloomPass
};

new Game({ THREEImpl });
