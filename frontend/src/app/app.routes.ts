import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/optimizer/optimizer').then((m) => m.Optimizer),
    title: 'Optimizer · Opptra Pricing Optimizer',
  },
  {
    path: 'story',
    loadComponent: () => import('./pages/story/story').then((m) => m.Story),
    title: 'Story · Opptra Pricing Optimizer',
  },
  { path: '**', redirectTo: '' },
];
