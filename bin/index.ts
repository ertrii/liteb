import { program } from 'commander';
import { createModule } from './actions/create-module';
import { initialize } from './actions/initialize';

program
  .name('liteb')
  .description('Herramientas de atajos para desarrolladores')
  .version('1.0.0');

program
  .command('init')
  .description('Inicializa el proyecto')
  .action(initialize);

program
  .command('module')
  .description('Crea un nuevo modulo para el backend')
  .option('-n, --name <char>', 'Nombre del nuevo módulo')
  .action(createModule);

program.parse();
