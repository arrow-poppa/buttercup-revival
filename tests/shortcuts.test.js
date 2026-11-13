import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutHandler } from '../background/shortcuts.js';

function fixture() {
    const calls=[], errors=[];
    const api={tabs:{query:async()=>[{id:7}],get:async id=>({id,url:'https://www.youtube.com/watch?v=abcdefghijk'})}};
    return {calls,errors,api,options:{api,ready:Promise.resolve(),generate:async(...args)=>calls.push(args),reportError:async(...args)=>errors.push(args)}};
}
test('commands target the active video and only explicit regeneration bypasses cache',async()=>{
    const f=fixture(), handler=shortcutHandler(f.options);
    await handler('generate-subtitles');await handler('regenerate-subtitles',{id:9});await handler('unknown');
    assert.deepEqual(f.calls,[[7,false],[9,true]]);assert.deepEqual(f.errors,[]);
});
test('shortcuts ignore unrelated tabs and report configuration errors without replaying',async()=>{
    const f=fixture(),handler=shortcutHandler(f.options);
    f.api.tabs.get=async()=>({url:'https://www.youtube.com.evil.example/watch?v=abcdefghijk'});
    await handler('regenerate-subtitles');assert.deepEqual(f.calls,[]);
    f.api.tabs.get=async()=>({url:'https://www.youtube.com/watch?v=abcdefghijk'});
    f.options.generate=async()=>{throw new Error('Fix provider configuration');};
    await shortcutHandler(f.options)('regenerate-subtitles');
    assert.equal(f.errors.length,1);assert.equal(f.errors[0][0],7);assert.match(f.errors[0][1].message,/configuration/);
});
