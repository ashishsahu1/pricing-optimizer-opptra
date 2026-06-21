import { Routes } from '@angular/router';

import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
    title: 'Sign in · Opptra Pricing Optimizer',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/optimizer/optimizer').then((m) => m.Optimizer),
    title: 'Optimizer · Opptra Pricing Optimizer',
  },
  {
    path: 'story',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/story/story').then((m) => m.Story),
    title: 'Story · Opptra Pricing Optimizer',
  },
  { path: '**', redirectTo: '' },
];
