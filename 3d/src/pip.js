// Picture-in-picture: small live chase cameras on the pumpkins in 2nd, 3rd and 4th place.
// The insets are drawn into the main canvas with scissor rectangles under the HTML frames,
// reusing this frame's shadow map and sea reflection so they stay cheap.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Race order at time t: finishers by time, then everyone still racing by distance.
export function raceOrder(views, t) {
  const done = [], running = [];
  for (const v of views) {
    const r = v.result;
    if (r.status === 'DQ') continue;
    if (t >= r.time) { if (r.status === 'FINISHED') done.push(v); continue; }
    running.push(v);
  }
  done.sort((a, b) => a.result.time - b.result.time);
  running.sort((a, b) => (b.state?.x ?? 0) - (a.state?.x ?? 0));
  return [...done, ...running];
}

export function createPips(container, count = 3) {
  const slots = Array.from({length: count}, (_, k) => {
    const el = document.createElement('div');
    el.className = 'pip'; el.hidden = true;
    el.innerHTML = '<span class="pip-label"><b></b><i></i><span class="nm"></span><span class="gap"></span></span>';
    container.append(el);
    return {el, place: k + 2, cam: new THREE.PerspectiveCamera(46, 16 / 9, 0.05, 40000), target: null, pos: V(0, 0, 0), look: V(0, 0, 0)};
  });
  let visible = [];

  function rig(v, course, t, out) {
    const F = v.root.position, r = v.radius, sp = v.state?.v ?? 0;
    if (v.state?.done && sp < 0.5) { // stopped after the line: slow orbit
      const a = t * 0.4 + v.team;
      out.pos.set(F.x + Math.cos(a) * 2.6, F.y + 0.9, F.z + Math.sin(a) * 2.6); out.look.copy(F);
      return;
    }
    const behind = 1.9 + r * 2.5 + Math.min(1.6, sp * 0.04);
    out.pos.set(F.x - behind, Math.max(course.roadY(F.x - behind), F.y) + 0.45 + r * 1.6, F.z + 0.55);
    out.look.set(F.x + 4, F.y + (course.roadY(F.x + 4) - course.roadY(F.x)) * 0.6 + 0.12, F.z);
  }

  return {
    slots,
    // Pick targets, move cameras, refresh labels. Returns the slots that should be drawn.
    update({views, course, simT, enabled, hidden, main = null}, dt) {
      visible = [];
      const order = enabled && !hidden && simT > 0.3 ? raceOrder(views, simT) : [];
      const leader = order[0];
      // The top four, minus whoever the main camera is following, so all four leaders are always on screen.
      const top = order.slice(0, slots.length + 1);
      const shown = (top.includes(main) ? top.filter(v => v !== main) : top.slice(1)).slice(0, slots.length);
      slots.forEach((s, k) => {
        const v = shown[k];
        if (!v) { s.el.hidden = true; s.target = null; return; }
        const want = {pos: V(0, 0, 0), look: V(0, 0, 0)};
        rig(v, course, simT, want);
        if (s.target !== v) { s.pos.copy(want.pos); s.look.copy(want.look); s.target = v; }
        else { s.pos.lerp(want.pos, 1 - Math.exp(-dt * 6)); s.look.lerp(want.look, 1 - Math.exp(-dt * 9)); }
        // Never below the ground.
        const floor = Math.max(course.terrainH(s.pos.x, s.pos.z), course.sea === false ? -1e9 : 0.5) + 0.3;
        if (s.pos.y < floor) s.pos.y = floor;
        s.cam.position.copy(s.pos); s.cam.lookAt(s.look);
        s.el.hidden = false;
        s.el.style.borderColor = v.color;
        s.el.querySelector('b').textContent = order.indexOf(v) + 1;
        s.el.querySelector('i').style.background = v.color;
        s.el.querySelector('.nm').textContent = v.name;
        let gap = '';
        const finished = r => r.status === 'FINISHED' && simT >= r.time;
        if (v === leader) gap = finished(v.result) ? `${v.result.time.toFixed(2)} s` : 'LEADER';
        else if (finished(v.result) && leader && finished(leader.result)) gap = `+${(v.result.time - leader.result.time).toFixed(2)} s`;
        else if (v.state?.air) gap = 'AIR';
        else if (leader) {
          const d = Math.max(0, (leader.state?.x ?? 0) - (v.state?.x ?? 0));
          gap = d < 0.3 ? 'level' : `${d.toFixed(d < 10 ? 1 : 0)} m back`;
        }
        s.el.querySelector('.gap').textContent = gap;
        visible.push(s);
      });
      return visible;
    },
    // Draw the visible insets into the main canvas.
    render(renderer, scene, views, water) {
      if (!visible.length) return;
      const autoShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      const mirror = water?.onBeforeRender;
      if (water && mirror) water.onBeforeRender = () => {};
      const labels = views.map(v => v.label.visible);
      views.forEach(v => { v.label.visible = false; });
      renderer.setScissorTest(true);
      const H = renderer.domElement.clientHeight;
      for (const s of visible) {
        const r = s.el.getBoundingClientRect();
        const x = r.left + 2, y = H - r.bottom + 2, w = r.width - 4, h = r.height - 4;
        if (w < 4 || h < 4) continue;
        s.cam.aspect = w / h; s.cam.updateProjectionMatrix();
        renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
        renderer.render(scene, s.cam);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, renderer.domElement.clientWidth, H);
      views.forEach((v, i) => { v.label.visible = labels[i]; });
      if (water && mirror) water.onBeforeRender = mirror;
      renderer.shadowMap.autoUpdate = autoShadow;
    },
    hideAll() { visible = []; slots.forEach(s => { s.el.hidden = true; s.target = null; }); },
  };
}
