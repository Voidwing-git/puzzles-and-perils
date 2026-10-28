import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {cubeFrames,faceSize} from '../core/cube-topology.ts';
import type {CubeCell, CubeFace,PrismDimensions} from '../core/cube-topology.ts';
import type {Tile,Energy} from '../core/state.ts';
import {stoneMaterial} from './cube-stone.ts';

export interface CubeViewCell extends CubeCell {tile: Tile | null; powered: boolean; energy?:Energy; mixed?:boolean; fractured?:boolean}
// The view owns only camera and GPU resources. Moves are delivered to the caller
// and must be validated by the authoritative controller before updating cells.
export function createCubeView(host: HTMLElement,onSelect: (cell: CubeCell)=>void,onRotate?: (cell:CubeCell)=>void) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x101720,1);
  renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';
  renderer.domElement.setAttribute('aria-label','Cube puzzle. Drag to orbit; click a square to select.');
  renderer.domElement.tabIndex=0;
  host.append(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(38,1,.1,100);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enablePan=false;controls.minDistance=3;controls.maxDistance=12;
  scene.add(new THREE.HemisphereLight(0xc9faff,0x233043,2));
  const light=new THREE.DirectionalLight(0xffe2b0,3);light.position.set(3,5,6);scene.add(light);
  let board=new THREE.Group();scene.add(board);
  let squares: THREE.Mesh[]=[];
  let disposed=false;
  let activeFaces:readonly CubeFace[]=[];
  let activeDimensions:PrismDimensions|undefined;
  let renderKey='';
  let previousCells=new Map<string,CubeViewCell>();
  let layoutKey='';
  const nodes=new Map<string,{square:THREE.Mesh<THREE.BoxGeometry,THREE.Material[]>;outline:THREE.LineLoop;front:THREE.MeshStandardMaterial;pending:THREE.MeshStandardMaterial|null;key:string}>();
  let lastTap:{cell:string;time:number}|null=null;
  const cellKey=(cell:CubeCell)=>`${cell.face}:${cell.x}:${cell.y}`;
  let multiplePointers=false;
  const pointers=new Set<number>();
  const ray=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  function draw(){if (!disposed) renderer.render(scene,camera);}
  controls.addEventListener('change',draw);
  function focusFace(face:CubeFace){
    const frame=cubeFrames[face];camera.position.set(...frame.normal).multiplyScalar(5.5).addScaledVector(new THREE.Vector3(...frame.right),.4).addScaledVector(new THREE.Vector3(...frame.down),-.3);
    camera.up.set(...frame.down).negate();controls.target.set(0,0,0);controls.update();draw();
  }
  function resetCamera(){
    camera.up.set(0,1,0);
    const normal=activeFaces.reduce((v,face)=>v.add(new THREE.Vector3(...cubeFrames[face].normal)),new THREE.Vector3());
    if(normal.lengthSq()===0)normal.set(1,.8,1);
    if(activeDimensions)normal.set(1,1.1,1.3);
    if(activeFaces.length===1){focusFace(activeFaces[0]);return;}
    camera.position.copy(normal.normalize().multiplyScalar(5.6)).add(new THREE.Vector3(.3,1.4,.3));controls.target.set(0,0,0);controls.update();draw();
  }
  const observer=new ResizeObserver(()=>{
    const {width,height}=host.getBoundingClientRect();
    if(width<1||height<1)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();draw();
  });observer.observe(host);
  let down: {x:number;y:number}|null=null;
  const start=(event:PointerEvent)=>{pointers.add(event.pointerId);multiplePointers||=pointers.size>1;down=event.button===0?{x:event.clientX,y:event.clientY}:null;};
  function pick(clientX:number,clientY:number): CubeCell|null {
    const rect=renderer.domElement.getBoundingClientRect();
    if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
    pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects(squares)[0];
    return hit?{...hit.object.userData.cell}:null;
  }
  const end=(event:PointerEvent)=>{
    pointers.delete(event.pointerId);
    if(multiplePointers){down=null;lastTap=null;if(pointers.size===0)multiplePointers=false;return;}
    if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5){down=null;lastTap=null;return;}
    down=null;
    const cell=pick(event.clientX,event.clientY);if(!cell){lastTap=null;return;}
    const now=performance.now(),key=cellKey(cell);
    renderer.domElement.focus({preventScroll:true});
    onSelect(cell);
    // One pointer path covers mouse double-click and touch double-tap without
    // also counting the browser's synthesized dblclick event.
    if(lastTap?.cell===key&&now-lastTap.time<=400){lastTap=null;onRotate?.(cell);}
    else lastTap={cell:key,time:now};
  };
  renderer.domElement.addEventListener('pointerdown',start);
  renderer.domElement.addEventListener('pointermove',event=>{if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5){down=null;lastTap=null;}});
  renderer.domElement.addEventListener('pointerup',end);
  renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;lastTap=null;if(!pointers.size)multiplePointers=false;});
  function release(group: THREE.Group){group.traverse(object=>{
    if(object instanceof THREE.Mesh||object instanceof THREE.Line){object.geometry.dispose();const materials=new Set(Array.isArray(object.material)?object.material:[object.material]);materials.forEach(material=>{if('map' in material&&material.map instanceof THREE.Texture)material.map.dispose();material.dispose();});}
  });}
  function disposeMaterial(material:THREE.MeshStandardMaterial){material.map?.dispose();material.dispose();}
  function clearBoard(){for(const node of nodes.values())if(node.pending)disposeMaterial(node.pending);nodes.clear();scene.remove(board);release(board);board=new THREE.Group();scene.add(board);squares=[];}
  function update(faces: readonly CubeFace[],size: number,cells: readonly CubeViewCell[],selected: CubeCell|null,animate=true,dimensions?:PrismDimensions){
    const key=JSON.stringify([faces,size,cells,selected,dimensions]);if(key===renderKey)return;renderKey=key;
    const unit=2/(dimensions?Math.max(dimensions.width,dimensions.depth,dimensions.height):size);
    const extent=dimensions?[dimensions.width,dimensions.height,dimensions.depth].map(n=>n*unit/2):[1,1,1];
    const nextLayout=JSON.stringify([faces,size,dimensions]),changed=nextLayout!==layoutKey;
    if(changed){clearBoard();previousCells.clear();layoutKey=nextLayout;}
    activeFaces=[...faces];
    activeDimensions=dimensions;
    for(const face of faces){
      const frame=cubeFrames[face];
      const grid=faceSize(face,size,dimensions);
      const normal=new THREE.Vector3(...frame.normal), right=new THREE.Vector3(...frame.right), up=new THREE.Vector3(...frame.down).negate();
      const distance=frame.normal.reduce((sum,n,i)=>sum+Math.abs(n)*extent[i],0);
      const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));
      for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
        const cell=cells.find(cell=>cell.face===face&&cell.x===x&&cell.y===y);
        const chosen=selected?.face===face&&selected.x===x&&selected.y===y;
        const data=cell??{face,x,y,tile:null,powered:false},id=cellKey(data),contentKey=JSON.stringify(data);
        let node=nodes.get(id);
        if(!node){
          const group=new THREE.Group();group.quaternion.copy(quaternion);
          group.position.copy(normal).multiplyScalar(distance).addScaledVector(right,-grid.width*unit/2+(x+.5)*unit).addScaledVector(up,grid.height*unit/2-(y+.5)*unit);
          const front=stoneMaterial(data,false,draw);
          const side=new THREE.MeshStandardMaterial({color:0x17212a,roughness:1});
          const square=new THREE.Mesh(new THREE.BoxGeometry(unit*.985,unit*.985,.045),[side,side,side,side,front,side]);
          square.userData.cell={face,x,y};group.add(square);squares.push(square);
          const h=unit*.49;
          const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-h,-h,.025),new THREE.Vector3(h,-h,.025),new THREE.Vector3(h,h,.025),new THREE.Vector3(-h,h,.025)]),new THREE.LineBasicMaterial({color:0xd2b583}));
          group.add(outline);board.add(group);
          node={square,outline,front,pending:null,key:contentKey};nodes.set(id,node);
        }
        node.outline.visible=chosen;
        if(node.key===contentKey)continue;
        const old=previousCells.get(id);
        let turns=0;
        if(animate&&!changed&&old?.tile&&cell?.tile&&!cell.tile.terminal&&old.tile.shape===cell.tile.shape){turns=(cell.tile.rotation-old.tile.rotation+4)%4;if(turns===3)turns=-1;}
        node.key=contentKey;
        if(node.pending)disposeMaterial(node.pending);
        const target=node;
        const next=stoneMaterial(data,false,draw,turns,()=>{
          if(disposed||target.pending!==next)return;
          disposeMaterial(target.front);target.front=next;target.square.material[4]=next;target.pending=null;
        });
        node.pending=next;
      }
    }
    previousCells=new Map(cells.map(cell=>[cellKey(cell),structuredClone(cell)]));
    if(changed)resetCamera();
    draw();
  }
  resetCamera();
  return {update,pick,focusFace,resetCamera,dispose(){disposed=true;observer.disconnect();controls.dispose();clearBoard();renderer.dispose();renderer.domElement.remove();}};
}
