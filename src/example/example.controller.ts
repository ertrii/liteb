import { Controller, Get, Param, Patch, Post, Delete } from 'liteb';
import { ExampleService } from './example.service';

@Controller('exaple')
export class ExampleController {
  private readonly exampleService = new ExampleService();

  @Get()
  findAll() {
    return [];
  }

  @Get(':example_id')
  findOne(@Param('example_id') exampleId: string) {
    return null;
  }

  @Post()
  create() {
    return null;
  }

  @Patch(':example_id')
  update(@Param('example_id') exampleId: string) {
    return null;
  }

  @Delete(':example_id')
  delete(@Param('example_id') exampleId: string) {
    return this.exampleService.delete(+exampleId);
  }
}
