import {mkdir,rename,unlink,stat,realpath} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DomainError,fail} from '../domain/errors.js';

/** File repository, separate from HTTP and SQL. Only server-generated paths are writable. */
export function createVideoStorage(uploadDir,maxBytes) {
  const root=resolve(uploadDir);
  return {
    root,
    async exists(file) { return Boolean(file && await stat(file).catch(()=>null)); },
    async readable(file) {
      if (!file) fail('not_found',404);
      if (!resolve(file).startsWith(root+sep)) fail('forbidden',403);
      const [base,target]=await Promise.all([realpath(root).catch(()=>null),realpath(file).catch(()=>null)]);
      if(!base||!target)fail('not_found',404);
      if(!target.startsWith(base+sep))fail('forbidden',403);
      if(!(await stat(target)).isFile())fail('not_found',404);
      return target;
    },
    async remove(file) {
      if(file && resolve(file).startsWith(root+sep))await unlink(file).catch(()=>{});
    },
    async write(id,expectedSize,source) {
      await mkdir(root,{recursive:true});
      const file=join(root,`${id}-${randomUUID()}.bin`),temp=file+'.part';
      let size=0;
      const meter=new Transform({transform(chunk,_encoding,done){
        size+=chunk.length;done(size>maxBytes?new DomainError('too_large',413):null,chunk);
      }});
      try {
        await pipeline(source,meter,createWriteStream(temp,{flags:'wx'}));
        if(size!==Number(expectedSize))fail('size_mismatch');
        await rename(temp,file);return file;
      } catch(error) {await unlink(temp).catch(()=>{});await unlink(file).catch(()=>{});throw error;}
    },
  };
}
