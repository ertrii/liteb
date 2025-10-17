import { Api, DataJson, Get, Module } from '../../../../lib';

@Module('crm')
@Get('periodosAdmision')
export default class RatesApi extends Api {
  public main(): DataJson {
    return [
      {
        Codigo: '202610',
        FechaInicio: '16/02/26 12:00 AM',
        FechaFin: '17/06/26 12:00 AM',
      },
      {
        Codigo: '202532',
        FechaInicio: '23/06/25 12:00 AM',
        FechaFin: '10/01/26 12:00 AM',
      },
      {
        Codigo: '202520',
        FechaInicio: '16/02/25 12:00 AM',
        FechaFin: '17/06/25 12:00 AM',
      },
    ];
  }
}
