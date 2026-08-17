import { useEffect, useRef } from "react";
import { Color4, Engine, FreeCamera, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import type { CharacterConfig } from "@ddd/shared";
import { createCharacter, type CharacterRig, type FighterKit } from "../game/character";

/** Live 3D character preview used in onboarding — the fighter idles and shows off. */
export function CharacterPreview({ config, withHat, kit }: { config: CharacterConfig; withHat: boolean; kit?: FighterKit }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<CharacterRig | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(canvas, true, { antialias: true });
    const scene = new Scene(engine);
    sceneRef.current = scene;
    scene.clearColor = new Color4(0.05, 0.02, 0.12, 1);
    const light = new HemisphericLight("l", new Vector3(0.3, 1, -0.5), scene);
    light.intensity = 1.1;
    light.groundColor = new Color3(0.3, 0.2, 0.45);
    const cam = new FreeCamera("c", new Vector3(0, 1.6, 3.4), scene);
    cam.setTarget(new Vector3(0, 1.1, 0));
    const disc = MeshBuilder.CreateDisc("stage", { radius: 1.2 }, scene);
    disc.rotation.x = Math.PI / 2;
    const dm = new StandardMaterial("dm", scene);
    dm.diffuseColor = Color3.FromHexString("#3a2a6e");
    dm.emissiveColor = Color3.FromHexString("#3a2a6e").scale(0.4);
    disc.material = dm;

    let t = 0;
    engine.runRenderLoop(() => {
      const dt = engine.getDeltaTime() / 1000;
      t += dt;
      const rig = rigRef.current;
      if (rig) {
        rig.root.rotation.y = Math.sin(t * 0.6) * 0.7; // face the camera, slow sway
        rig.update(dt, 0);
      }
      scene.render();
    });
    const onResize = (): void => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      rigRef.current?.dispose();
      rigRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    rigRef.current?.dispose();
    const rig = createCharacter(scene, config, { withHat, ...(kit ? { kit } : {}) });
    rig.setAnim("idle");
    rig.setNameplate("", 1, false);
    rigRef.current = rig;
  }, [config.bodyId, config.colorId, config.faceId, config.hairId, config.accessoryId, withHat]);

  return (
    <div className="preview-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
