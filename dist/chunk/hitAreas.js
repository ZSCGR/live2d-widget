/*!
 * Live2D Widget
 * https://github.com/stevenjoezhang/live2d-widget
 */
const t={head:["head","face","头","头部","脸","脸部"],body:["body","身","身体"],breast:["breast","bust","chest","胸","胸部"],belly:["belly","stomach","腹","腹部","肚子"],leg:["leg","legs","foot","腿","腿部","脚"],arm:["arm","arms","hand","手","手臂","胳膊"]},e=new Map;for(const[a,o]of Object.entries(t))for(const t of o)e.set(t,a);const a=Object.entries(t).flatMap(([t,e])=>e.map(e=>[e,t])).sort((t,e)=>e[0].length-t[0].length);function o(t){const o=t.trim().toLowerCase(),r=e.get(o);if(r)return r;for(const[t,e]of a)if(o.includes(t))return e;return t}const r={head:["tap_face","flick_head"],body:["tap_body"],breast:["tap_breast","tap_body"],belly:["tap_belly","tap_body"],leg:["tap_leg","tap_body"],arm:["tap_arm","tap_body"]};function s(t){var e;const a=o(t),s=[t];a!==t&&s.push(a);for(const t of null!==(e=r[a])&&void 0!==e?e:[])s.includes(t)||s.push(t);return s}function n(t){return"head"===o(t)?"live2d:taphead":"live2d:tapbody"}export{o as c,n as f,s as m};
//# sourceMappingURL=hitAreas.js.map
