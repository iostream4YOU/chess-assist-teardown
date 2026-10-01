// Static deobfuscator for the Chess Assist bundle. Never executes the input.
// Usage: node deob.js <input.js> <output.js> [blobs.json]
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const [, , inFile, outFile, blobFile] = process.argv;
const src = fs.readFileSync(inFile, 'utf8');
const ast = parser.parse(src, { sourceType: 'script', errorRecovery: true });

const blobs = [];
const isIdent = (s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && !['default', 'class', 'function', 'delete', 'new', 'in', 'for', 'if', 'do', 'var', 'let', 'const', 'return', 'switch', 'case', 'try', 'catch', 'this', 'typeof', 'void', 'with', 'while', 'break', 'continue', 'throw', 'finally', 'else', 'import', 'export', 'super', 'extends', 'instanceof', 'yield', 'await', 'enum', 'null', 'true', 'false'].includes(s);

function numVal(node) {
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument)) return -node.argument.value;
  return undefined;
}

let passes = 0, changed = true;
while (changed && passes < 10) {
  changed = false; passes++;
  traverse(ast, {
    // Fold hex arithmetic like -0xc56+-0xb*-0x269+0x1*-0xe2d  ->  0
    BinaryExpression: { exit(path) {
      const { operator, left, right } = path.node;
      const a = numVal(left), b = numVal(right);
      if (a === undefined || b === undefined) return;
      let r;
      switch (operator) {
        case '+': r = a + b; break; case '-': r = a - b; break;
        case '*': r = a * b; break; case '/': r = a / b; break;
        case '%': r = a % b; break; default: return;
      }
      if (!Number.isFinite(r)) return;
      path.replaceWith(r < 0 ? t.unaryExpression('-', t.numericLiteral(-r)) : t.numericLiteral(r));
      changed = true;
    }},
    NumericLiteral(path) {
      // normalise 0x1f4e -> 8014 (drop raw hex formatting)
      if (path.node.extra && /^0x/i.test(path.node.extra.raw)) { delete path.node.extra; changed = true; }
    },
    UnaryExpression(path) {
      const { operator, argument } = path.node;
      // ![] -> false, !![] -> true
      if (operator === '!' && t.isArrayExpression(argument) && argument.elements.length === 0) {
        path.replaceWith(t.booleanLiteral(false)); changed = true; return;
      }
      if (operator === '!' && t.isBooleanLiteral(argument)) {
        path.replaceWith(t.booleanLiteral(!argument.value)); changed = true;
      }
    },
    MemberExpression(path) {
      // obj['prop'] -> obj.prop
      const { property, computed } = path.node;
      if (computed && t.isStringLiteral(property) && isIdent(property.value)) {
        path.node.property = t.identifier(property.value); path.node.computed = false; changed = true;
      }
    },
    StringLiteral(path) {
      // Pull out large base64 data URIs so the logic is readable
      const v = path.node.value;
      if (v.length > 400 && /^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(v)) {
        const id = blobs.length;
        const mime = v.slice(5, v.indexOf(';'));
        blobs.push({ id, mime, length: v.length, value: v });
        path.replaceWith(t.stringLiteral(`<<BLOB_${id}:${mime}:${v.length}b>>`));
        path.skip(); changed = true;
      }
    },
    ObjectProperty(path) {
      // {'key': v} -> {key: v}
      const k = path.node.key;
      if (!path.node.computed && t.isStringLiteral(k) && isIdent(k.value)) { path.node.key = t.identifier(k.value); changed = true; }
    },
  });
}

const out = generate(ast, { comments: true, retainLines: false, jsescOption: { minimal: true } }).code;
fs.writeFileSync(outFile, out);
if (blobFile) fs.writeFileSync(blobFile, JSON.stringify(blobs.map(({ id, mime, length }) => ({ id, mime, length })), null, 1));
if (blobFile) fs.writeFileSync(blobFile.replace(/\.json$/, '.full.json'), JSON.stringify(blobs));
console.log(`passes=${passes} blobs=${blobs.length} in=${src.length} out=${out.length}`);
