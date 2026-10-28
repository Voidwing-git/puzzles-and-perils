import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cubeFaces,cubeNeighbor,connectedFaces,cubeCell,cubeIndex,faceSize} from '../src/core/cube-topology.ts';
import {generateCube} from '../src/core/cube-generator.ts';
import {traceEnergy} from '../src/core/connectivity.ts';
import {projectPublic} from '../src/core/projection.ts';
import {assertFits} from '../src/transport/protocol.ts';

test('4x4x1 dais seams preserve reciprocal cells, generation and public dimensions',()=>{
  const faces=cubeFaces.filter(face=>face!=='bottom'),dimensions={width:4,depth:4,height:1};
  assert.deepEqual(faceSize('top',4,dimensions),{width:4,height:4});
  assert.deepEqual(faceSize('right',4,dimensions),{width:4,height:1});
  for(let index=0;index<32;index++){
    const cell=cubeCell(index,4,faces,dimensions);assert.equal(cubeIndex(cell,4,faces,dimensions),index);
    for(const direction of [0,1,2,3] as const){const next=cubeNeighbor(cell,direction,4,faces,dimensions);if(!next)continue;assert.deepEqual(cubeNeighbor(next,next.entry,4,faces,dimensions),{...cell,entry:direction});}
  }
  for(const powers of [1,2,3])for(const targets of [1,2])for(let seed=0;seed<20;seed++){
    const p=generateCube({size:4,faces,dimensions,powers,targets,seed:'dais-'+seed},'dais');
    assert.equal(p.state.tiles.length,32);assert.equal(traceEnergy(p.state).solved,false);
    assert.equal(traceEnergy({...p.state,tiles:p.solution}).solved,true);
    assert.deepEqual(projectPublic(p).cubeDimensions,dimensions);
  }
});

test('face selection requires a connected surface, including bridges between opposite faces',()=>{
  assert.equal(connectedFaces(['top','bottom']),false);
  assert.equal(connectedFaces(['top','front','bottom']),true);
  assert.equal(connectedFaces(cubeFaces),true);
  assert.equal(connectedFaces([]),false);
  assert.equal(connectedFaces(['front','front']),false);
});
test('every cube seam is reciprocal with correct entry orientation and no duplicate neighbors',()=>{
  for (const size of [1,2,3,6]) for (const face of cubeFaces) {
    const neighbors=new Set<string>();
    for (const direction of [0,1,2,3] as const) for (let offset=0;offset<size;offset++) {
      const cell={face,x:direction===1?size-1:direction===3?0:offset,y:direction===0?0:direction===2?size-1:offset};
      const next=cubeNeighbor(cell,direction,size,cubeFaces)!;
      assert.notEqual(next.face,face);
      const back=cubeNeighbor(next,next.entry,size,cubeFaces)!;
      assert.deepEqual(back,{...cell,entry:direction});
      neighbors.add(`${next.face}:${next.x}:${next.y}:${next.entry}`);
    }
    assert.equal(neighbors.size,4*size);
  }
});
test('front to right preserves rows; top to right reverses edge offsets',()=>{
  assert.deepEqual(cubeNeighbor({face:'front',x:2,y:0},1,3,cubeFaces),{face:'right',x:0,y:0,entry:3});
  assert.deepEqual(cubeNeighbor({face:'top',x:2,y:0},1,3,cubeFaces),{face:'right',x:2,y:0,entry:0});
  assert.equal(cubeNeighbor({face:'top',x:0,y:0},0,3,['top','front']),null);
});
test('generated cube solutions power every goal across connected face selections',()=>{
  for(const faces of [['front','right'],['top','front','bottom'],cubeFaces] as const)for(const size of [3,4])for(const powers of [1,2,3])for(let seed=0;seed<4;seed++){
    const preparation=generateCube({size,faces:[...faces],powers,targets:2,seed:'cube-'+seed},'cube');
    assert.equal(traceEnergy({...preparation.state,tiles:preparation.solution}).solved,true);
    assert.equal(traceEnergy(preparation.state).solved,false);
    assert.deepEqual(projectPublic(preparation).cubeFaces,faces);
    assert.equal(preparation.solution.length,faces.length*size*size);
    assert.deepEqual(generateCube({size,faces:[...faces],powers,targets:2,seed:'cube-'+seed},'cube').solution,preparation.solution);
  }
});
test('all 60 connected subsets generate and fit public metadata with a full receipt history',()=>{
  let checked=0;
  for(let mask=1;mask<64;mask++){
    const faces=cubeFaces.filter((_,i)=>mask&(1<<i));if(!connectedFaces(faces))continue;
    for(const size of [3,4]){
      const preparation=generateCube({size,faces,powers:faces.length===1?1:3,targets:2,seed:'all-subsets-'+mask},'test-cube');
      preparation.state.tiles=preparation.solution;
      assert.equal(traceEnergy(preparation.state).solved,true);
      assertFits({},{version:1,owner:'gm',generation:'test',puzzle:projectPublic(preparation),receipts:Array.from({length:24},(_,i)=>({id:crypto.randomUUID(),connection:'gm-connection',revision:i,accepted:true}))});
      checked++;
    }
  }
  assert.equal(checked,120);
  assert.throws(()=>generateCube({size:3,faces:['front'],powers:3,targets:2,seed:'invalid'},'cube'),/Not enough surface/);
});
