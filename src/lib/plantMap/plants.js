import { AMARCORD_PLANT } from './amarcord'
import { plantKeyForOrg } from './index'

const PLANTS = { amarcord: AMARCORD_PLANT }

export function getPlantForOrg(orgId) {
  return PLANTS[plantKeyForOrg(orgId)] || null
}
