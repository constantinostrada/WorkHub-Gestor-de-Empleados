/**
 * IDepartmentRepository — Repository Interface (Domain)
 */

import type { Department } from '../entities/Department';

export interface IDepartmentRepository {
  findById(id: string): Promise<Department | null>;
  findByName(name: string): Promise<Department | null>;
  findAll(): Promise<Department[]>;
  save(department: Department): Promise<void>;
  update(department: Department): Promise<void>;
  delete(id: string): Promise<void>;
  existsById(id: string): Promise<boolean>;
}
