import fs from 'fs';
import path from 'path';

export function createModule(option: { name: string }) {
  const name = option.name.toLowerCase();
  if (!name || name === '') {
    console.log('Indique el nombre del modulo');
    return;
  }

  const __dirname = path.resolve();
  const baseDir = `${__dirname}/src/${name}`;

  if (fs.existsSync(baseDir)) {
    console.log('El nombre del módulo ya existe');
    return;
  }

  const baseDirTemplate = `${__dirname}/bin/templates`;
  let controllerTemplate = fs.readFileSync(
    `${baseDirTemplate}/controller.txt`,
    'utf-8',
  );
  let serviceTemplate = fs.readFileSync(
    `${baseDirTemplate}/service.txt`,
    'utf-8',
  );
  let entityTemplate = fs.readFileSync(
    `${baseDirTemplate}/entity.txt`,
    'utf-8',
  );
  const nameCapitalize = name.charAt(0).toUpperCase() + name.slice(1);

  controllerTemplate = controllerTemplate.replace(/_1_/g, name);
  controllerTemplate = controllerTemplate.replace(/_2_/g, nameCapitalize);
  controllerTemplate = controllerTemplate.replace(/\r\n/g, '\n');
  serviceTemplate = serviceTemplate.replace(/_1_/g, name);
  serviceTemplate = serviceTemplate.replace(/_2_/g, nameCapitalize);
  serviceTemplate = serviceTemplate.replace(/\r\n/g, '\n');
  entityTemplate = entityTemplate.replace(/_1_/g, name);
  entityTemplate = entityTemplate.replace(/_2_/g, nameCapitalize);
  entityTemplate = entityTemplate.replace(/\r\n/g, '\n');

  fs.mkdirSync(`${baseDir}`);
  fs.mkdirSync(`${baseDir}/entities`);
  fs.mkdirSync(`${baseDir}/interfaces`);
  fs.writeFileSync(`${baseDir}/${name}.controller.ts`, controllerTemplate);
  fs.writeFileSync(`${baseDir}/${name}.service.ts`, serviceTemplate);
  fs.writeFileSync(`${baseDir}/entities/${name}.entity.ts`, entityTemplate);
}
