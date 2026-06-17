// Pure geometry shared by the Drone Arena client AND its unit tests.
// Framework-free: every "point" just needs numeric .x/.y/.z (so THREE.Vector3,
// THREE.Box3 corners, and plain {x,y,z} test objects all work). No imports.

// Drone (sphere radius r) vs an axis-aligned building box. Mirrors the solid-
// wall rule the flight code uses: blocked on X/Z within r of the footprint, and
// from the box floor up to its roof + r — so you can fly OVER a building, but
// not through its walls.
export function hitsBox(p, min, max, r) {
  return p.x > min.x - r && p.x < max.x + r &&
         p.z > min.z - r && p.z < max.z + r &&
         p.y > min.y && p.y < max.y + r;
}

// Ray (origin + unit dir) vs sphere (center, radius). Returns the forward
// distance to the sphere when the shot hits it IN FRONT of the origin, else
// null (sphere behind, or the shot misses).
export function raySphere(origin, dir, center, rad) {
  const ox = center.x - origin.x, oy = center.y - origin.y, oz = center.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return null;                          // target is behind the shot
  const d2 = (ox * ox + oy * oy + oz * oz) - tca * tca;
  if (d2 > rad * rad) return null;                   // shot passes wide
  return tca;
}

// Does the segment p0->p1 intersect the axis-aligned box (min/max)? Slab method
// clamped to the segment range [0,1]. Points/corners use .x/.y/.z (THREE vectors
// or plain objects). Used as a line-of-sight test so buildings give real cover.
export function segmentHitsBox(p0, p1, min, max) {
  let tmin = 0, tmax = 1;
  for (const ax of ["x", "y", "z"]) {
    const d = p1[ax] - p0[ax];
    if (Math.abs(d) < 1e-9) {
      if (p0[ax] < min[ax] || p0[ax] > max[ax]) return false;
    } else {
      let t1 = (min[ax] - p0[ax]) / d, t2 = (max[ax] - p0[ax]) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Of the candidate targets the shot could hit, return the id of the NEAREST one
// (or null). `targets` is a list of { id, pos } where pos has .x/.y/.z.
export function pickRayTarget(origin, dir, targets, rad) {
  let best = Infinity, hitId = null;
  for (const t of targets) {
    const d = raySphere(origin, dir, t.pos, rad);
    if (d !== null && d < best) { best = d; hitId = t.id; }
  }
  return hitId;
}
