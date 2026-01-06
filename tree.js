// tree.js
const fs = require('fs');
const path = require('path');

function printTree(dir, prefix = '') {
  const ignore = ['node_modules', 'objects', 'webpack'];
  const items = fs.readdirSync(dir).filter(item =>!ignore.includes(item)); // ignorar node_modules
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const pointer = isLast ? '└── ' : '├── ';
    const fullPath = path.join(dir, item);
    console.log(prefix + pointer + item);
    if (fs.statSync(fullPath).isDirectory()) {
      printTree(fullPath, prefix + (isLast ? '    ' : '│   '));
    }
  });
}

printTree(process.cwd());
