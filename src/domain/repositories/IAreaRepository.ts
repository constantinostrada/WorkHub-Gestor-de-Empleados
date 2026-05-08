/**
 * IAreaRepository — Repository Interface (Domain)
 */

import type { Area } from '../entities/Area';

export interface IAreaRepository {
  findById(id: string): Promise<Area | null>;
  findByName(name: string): Promise<Area | null>;
  findAll(): Promise<Area[]>;
  save(area: Area): Promise<void>;
  update(area: Area): Promise<void>;
  delete(id: string): Promise<void>;
  existsById(id: string): Promise<boolean>;
}
