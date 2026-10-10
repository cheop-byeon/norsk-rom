import {readFileSync,writeFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const inlineModel=name=>read(name).replace(/^export /gm,'');
const inlineUI=name=>read(name).replace(/^import .*\n/gm,'');
let html=read('index.html').replace('<script type="module" src="web.js"></script>','').replace('<script type="module" src="lesson.js"></script>','');
const script=inlineModel('model.js')+'\n'+inlineUI('web.js')+'\n'+inlineModel('lesson-model.js')+'\n'+inlineUI('lesson.js');
html=html.replace('</body>','<script>\n'+script+'\n</script></body>');
writeFileSync(new URL('preview.html',import.meta.url),html);
console.log('Built self-contained preview.html');
