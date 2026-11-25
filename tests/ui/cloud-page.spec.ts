import { expect, test } from '@playwright/test';
import { seed } from './fixture';

test('navigates to Cloud page and displays stats, providers, architecture and CI/CD', async ({ page }) => {
  await seed(page);

  // Click on Cloud in Main navigation island
  const cloudNav = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Cloud' });
  await expect(cloudNav).toBeVisible();
  await cloudNav.click();

  // Verify Heading
  await expect(page.getByRole('heading', { name: 'Cloud & Infrastructure' })).toBeVisible();
  await expect(page.getByText('Temps réel actif')).toBeVisible();

  // Verify Provider Filter Pills
  await expect(page.getByRole('button', { name: 'AWS (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google Cloud (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scaleway (1)' })).toBeVisible();

  // Verify KPI Cards
  await expect(page.getByText('Resources Clés')).toBeVisible();
  await expect(page.getByText('Pipelines CI/CD', { exact: true })).toBeVisible();
  await expect(page.getByText('Fichiers IaC & Tofu')).toBeVisible();

  // Verify Architecture Topology Tab (Default)
  await expect(page.getByRole('tab', { name: /Topologie & Architecture/ })).toHaveAttribute(
    'data-state',
    'active',
  );
  await expect(page.getByText('Deploy Production')).toBeVisible();
  await expect(page.getByText('app_assets')).toBeVisible();
  await expect(page.getByText('api', { exact: true })).toBeVisible();

  // Switch to Resources & Config Tab
  await page.getByRole('tab', { name: /Ressources & Config/ }).click();
  await expect(page.getByPlaceholder(/Rechercher une ressource/)).toBeVisible();
  await expect(page.getByText('aws_s3_bucket')).toBeVisible();
  await expect(page.getByText('scaleway_instance_server')).toBeVisible();

  // Switch to CI/CD & Deployments Tab
  await page.getByRole('tab', { name: /CI\/CD & Déploiements/ }).click();
  await expect(page.getByText('Actions & Connecteurs :')).toBeVisible();
  await expect(page.getByText('Secrets & Identifiants Référencés :')).toBeVisible();
  await expect(page.getByText('AWS_ACCESS_KEY_ID')).toBeVisible();

  // Switch to IaC Modules Tab
  await page.getByRole('tab', { name: /IaC Modules & Backends/ }).click();
  await expect(page.getByText('terraform-aws-modules/vpc/aws')).toBeVisible();
  await expect(page.getByText('worklens-terraform-state')).toBeVisible();

  // Switch to Scaleway Live Tab
  await page.getByRole('tab', { name: /Scaleway Live/ }).click();
  await expect(page.getByText('Synchronisation Scaleway Active')).toBeVisible();
  await expect(page.getByText('Bases de Données Relationnelles Managées')).toBeVisible();
  await expect(page.getByText('worklens-db')).toBeVisible();
  await expect(page.getByText('worklens-k8s')).toBeVisible();

  // Open Scaleway Auth Modal via API Scaleway button
  await page.getByRole('button', { name: /API Scaleway/ }).click();
  await expect(page.getByRole('heading', { name: 'API Scaleway Live' })).toBeVisible();
  await expect(page.getByText('Trousseau macOS')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
});
