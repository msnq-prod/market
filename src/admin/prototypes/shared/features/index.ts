import type { AdminPrototypeFeature, AdminPrototypeFeatureId } from '../types';
import { physicalFeature } from './physical';
import { planetFeature } from './planet';
import { salesFeature } from './sales';
import { systemFeature } from './system';

export const adminPrototypeFeatures: AdminPrototypeFeature[] = [
    physicalFeature,
    salesFeature,
    planetFeature,
    systemFeature
];

export const isAdminPrototypeFeatureId = (value?: string): value is AdminPrototypeFeatureId =>
    adminPrototypeFeatures.some((feature) => feature.id === value);

export const getAdminPrototypeFeature = (id: AdminPrototypeFeatureId) =>
    adminPrototypeFeatures.find((feature) => feature.id === id) || physicalFeature;
