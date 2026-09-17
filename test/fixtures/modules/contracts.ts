import { contract } from '../../../lib';

/** Contrato que publica el módulo de facturación. */
export interface BillingService {
  emitirCargo(input: { cliente: string; monto: number }): Promise<{ id: string }>;
}

export const BillingService = contract<BillingService>('billing.service');
