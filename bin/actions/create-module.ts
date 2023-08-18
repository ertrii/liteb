import Config from '../config';
import fs from 'fs';
import path from 'path';

export function createModule(option: { name: string }) {
  const config = Config();
  const name = option.name.toLowerCase();
  if (!name || name === '') {
    console.log('Indique el nombre del modulo');
    return;
  }

  const baseDir = path.resolve();
  const sourceDir = `${baseDir}/${config.dir}/${name}`;

  if (fs.existsSync(sourceDir)) {
    console.log('El nombre del módulo ya existe');
    return;
  }

  const baseDirTemplate = `${__dirname}/../templates`;

  fs.mkdirSync(sourceDir);

  const nameCapitalize = name.charAt(0).toUpperCase() + name.slice(1);

  // controllers
  let controllerTemplate = fs.readFileSync(
    `${baseDirTemplate}/controller.txt`,
    'utf-8',
  );
  controllerTemplate = controllerTemplate.replace(/_1_/g, name);
  controllerTemplate = controllerTemplate.replace(/_2_/g, nameCapitalize);
  controllerTemplate = controllerTemplate.replace(/\r\n/g, '\n');
  fs.writeFileSync(`${sourceDir}/${name}.controller.ts`, controllerTemplate);

  // services
  let serviceTemplate = fs.readFileSync(
    `${baseDirTemplate}/service.txt`,
    'utf-8',
  );
  serviceTemplate = serviceTemplate.replace(/_1_/g, name);
  serviceTemplate = serviceTemplate.replace(/_2_/g, nameCapitalize);
  serviceTemplate = serviceTemplate.replace(/\r\n/g, '\n');
  fs.writeFileSync(`${sourceDir}/${name}.service.ts`, serviceTemplate);

  // entities
  if (config.services.includes('typeorm')) {
    let entityTemplate = fs.readFileSync(
      `${baseDirTemplate}/entity.txt`,
      'utf-8',
    );
    entityTemplate = entityTemplate.replace(/_1_/g, name);
    entityTemplate = entityTemplate.replace(/_2_/g, nameCapitalize);
    entityTemplate = entityTemplate.replace(/\r\n/g, '\n');
    fs.mkdirSync(`${sourceDir}/entities`);
    fs.writeFileSync(`${sourceDir}/entities/${name}.entity.ts`, entityTemplate);
  }

  // others
  fs.mkdirSync(`${sourceDir}/interfaces`);
  fs.mkdirSync(`${sourceDir}/dto`);
  fs.mkdirSync(`${sourceDir}/dro`);
}
