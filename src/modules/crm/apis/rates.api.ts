import { Api, DataJson, Get, Module } from '../../../../lib';

@Module('crm')
@Get('periodosAdmisionTarifa')
export default class RatesApi extends Api {
  public main(): DataJson {
    return [
      {
        Codigo: '202520',
        FechaInicio: '03/10/25 12:00 AM',
        FechaFin: '06/06/2026 12:00 AM',
      },
      {
        Codigo: '202610',
        FechaInicio: '03/10/25 12:00 AM',
        FechaFin: '06/06/2026 12:00 AM',
      },
      {
        Codigo: '202632',
        FechaInicio: '03/10/25 12:00 AM',
        FechaFin: '06/06/2026 12:00 AM',
      },
    ];
  }
}
