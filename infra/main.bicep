// St. Mary's Bank — Help Desk: Azure landing zone (Phase 0).
// Mirrors the PMO enterprise target: App Service (Linux, Node) + Azure Database
// for PostgreSQL Flexible Server + Key Vault, plus Blob Storage for attachments.
// Secrets are referenced from Key Vault via the App Service managed identity.
//
// Deploy (example):
//   az group create -n rg-helpdesk-prod -l eastus2
//   az deployment group create -g rg-helpdesk-prod -f infra/main.bicep \
//      -p namePrefix=smbhelpdesk pgAdminPassword=<secret>

@description('Short prefix for resource names (lowercase, <= 12 chars).')
@maxLength(12)
param namePrefix string = 'smbhelpdesk'

@description('Azure region.')
param location string = resourceGroup().location

@description('PostgreSQL administrator login.')
param pgAdminLogin string = 'hdadmin'

@description('PostgreSQL administrator password.')
@secure()
param pgAdminPassword string

@description('App Service plan SKU.')
param appServiceSku string = 'P1v3'

var suffix = uniqueString(resourceGroup().id)
var appName = '${namePrefix}-app-${suffix}'
var planName = '${namePrefix}-plan'
var pgName = '${namePrefix}-pg-${suffix}'
var kvName = take('${namePrefix}kv${suffix}', 24)
var storageName = take(toLower('${namePrefix}st${suffix}'), 24)

// ── App Service plan + web app ────────────────────────────────────────
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: appServiceSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '22-lts'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
    }
  }
}

// Zero-downtime deploy slot (swap after smoke tests).
resource stagingSlot 'Microsoft.Web/sites/slots@2023-12-01' = {
  parent: app
  name: 'staging'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      minTlsVersion: '1.2'
    }
  }
}

// ── PostgreSQL Flexible Server (zone-redundant HA) ────────────────────
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgName
  location: location
  sku: {
    name: 'Standard_D2ds_v5'
    tier: 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminLogin
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: 128
    }
    highAvailability: {
      mode: 'ZoneRedundant'
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Enabled'
    }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pg
  name: 'helpdesk'
}

// ── Blob storage (attachments) ────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

// ── Key Vault (secrets via managed identity) ──────────────────────────
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

// Grant the web app read access to Key Vault secrets (Key Vault Secrets User).
resource kvRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, app.id, 'kv-secrets-user')
  scope: kv
  properties: {
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
    // Key Vault Secrets User
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
  }
}

output appUrl string = 'https://${app.properties.defaultHostName}'
output keyVaultName string = kv.name
output postgresHost string = pg.properties.fullyQualifiedDomainName
output storageAccount string = storage.name
