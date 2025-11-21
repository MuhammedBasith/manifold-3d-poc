import * as THREE from 'three';

export function createInfiniteGridMeshV3(size: number = 1, divisions: number = 10, color: number = 0x444444, distance: number = 8000) {
  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);

  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uSize: { value: size },
      uColor: { value: new THREE.Color(color) },
      uGridDistanceV3: { value: distance },
    },
    transparent: true,
    vertexShader: `
      // Shader version 6
      varying vec3 worldPosition;
      uniform float uGridDistanceV3;
      
      void main() {
        vec3 pos = position.xzy * uGridDistanceV3;
        pos.xz += cameraPosition.xz;
        worldPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 worldPosition;
      uniform float uSize;
      uniform vec3 uColor;
      uniform float uGridDistanceV3;
      
      float getGrid(float size) {
        vec2 r = worldPosition.xz / size;
        vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
        float line = min(grid.x, grid.y);
        return 1.0 - min(line, 1.0);
      }
      
      void main() {
        float d = distance(worldPosition.xz, cameraPosition.xz) / uGridDistanceV3;
        float alpha = 1.0 - smoothstep(0.8, 1.0, d);
        
        float g1 = getGrid(uSize);
        float g2 = getGrid(uSize * 10.0);
        
        float mixVal = 0.0;
        if(g1 > 0.0) mixVal = 0.5;
        if(g2 > 0.0) mixVal = 0.8;
        
        gl_FragColor = vec4(uColor, mixVal * alpha);
        if (gl_FragColor.a <= 0.0) discard;
      }
    `,
    extensions: {
      derivatives: true,
    },
  } as any);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'infiniteGrid';

  // Ensure it renders behind everything else if needed, but usually standard depth test is fine
  // mesh.renderOrder = -1; 

  return mesh;
}
