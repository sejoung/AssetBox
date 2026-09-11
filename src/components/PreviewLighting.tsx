import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Local studio reflections: first preview never waits for an HDR download. */
export function PreviewLighting() {
  const { gl, scene, invalidate } = useThree();
  useLayoutEffect(() => {
    const room = new RoomEnvironment();
    const generator = new PMREMGenerator(gl);
    const previous = scene.environment;
    let environment: ReturnType<PMREMGenerator["fromScene"]>;
    try {
      environment = generator.fromScene(room, 0.04);
    } finally {
      room.dispose();
      generator.dispose();
    }
    scene.environment = environment.texture;
    invalidate();
    return () => {
      scene.environment = previous;
      environment.dispose();
      invalidate();
    };
  }, [gl, scene, invalidate]);
  return null;
}
