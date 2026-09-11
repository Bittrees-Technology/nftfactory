import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const rows = [];
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.tsx') && !file.includes('.test.')) {
      const source = ts.createSourceFile(file, readFileSync(file,'utf8'), ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (['Link','a','button','input','textarea','select','summary','iframe'].includes(tag)) {
            rows.push({file, line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,tag,control:node.getText(source).replace(/\s+/g,' ').slice(0,700),status:'source-inventoried; interaction verification pending'});
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
walk('apps/web/app'); walk('apps/web/components');
writeFileSync('docs/reviews/product-expansion/control-inventory.json',JSON.stringify({scope:'JSX source controls, including conditional legacy states; not a browser pass',controls:rows},null,2)+'\n');
console.log(`${rows.length} source controls inventoried`);
