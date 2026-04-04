import type { DiagramZone } from '@/types/diagram'

/**
 * Locomotive diagram zone definitions.
 *
 * ViewBox: 0 0 800 270
 *
 * Physical layout (left = cab end, right = engine/cooling end):
 *
 *  |--Cab--|--Electrical--|--Pneumatics--|--Engine--|--Cooling--|
 *  |       |              |              |          |           |
 *  |       |              |--Fuel Tank ------------|           |
 *  |_______|______________________________________________layer_|
 *  [=============== Brakes strip ===========================]
 *  [Traction-front]                        [Traction-rear]
 *      (O)(O)(O)                              (O)(O)(O)
 */
export const DIAGRAM_ZONES: DiagramZone[] = [
  {
    zoneId: 'cab',
    label: 'Cab / Controls',
    shortLabel: 'Cab',
    subsystemId: null,
    metricIds: ['motion.speed', 'motion.acceleration', 'motion.distance'],
    shape: { type: 'rect', x: 22, y: 45, w: 124, h: 165, rx: 5 },
    labelPosition: { x: 84, y: 133 },
  },
  {
    zoneId: 'electrical',
    label: 'Electrical Cabinet',
    shortLabel: 'Electrical',
    subsystemId: 'electrical',
    metricIds: ['electrical.traction_voltage', 'electrical.traction_current', 'electrical.battery_voltage'],
    shape: { type: 'rect', x: 148, y: 67, w: 140, h: 143, rx: 5 },
    labelPosition: { x: 218, y: 138 },
  },
  {
    zoneId: 'pneumatics',
    label: 'Pneumatic System',
    shortLabel: 'Pneumatics',
    subsystemId: 'pneumatic',
    metricIds: ['pressure.brake_main'],
    shape: { type: 'rect', x: 290, y: 67, w: 122, h: 73, rx: 5 },
    labelPosition: { x: 351, y: 103 },
  },
  {
    zoneId: 'engine',
    label: 'Engine',
    shortLabel: 'Engine',
    subsystemId: 'engine',
    metricIds: ['thermal.coolant_temp', 'thermal.oil_temp', 'thermal.exhaust_temp', 'pressure.oil'],
    shape: { type: 'rect', x: 414, y: 67, w: 150, h: 73, rx: 5 },
    labelPosition: { x: 489, y: 103 },
  },
  {
    zoneId: 'fuel',
    label: 'Fuel System',
    shortLabel: 'Fuel',
    subsystemId: 'fuel',
    metricIds: ['fuel.level', 'fuel.consumption_rate'],
    shape: { type: 'rect', x: 290, y: 142, w: 274, h: 68, rx: 5 },
    labelPosition: { x: 427, y: 176 },
  },
  {
    zoneId: 'cooling',
    label: 'Cooling System',
    shortLabel: 'Cooling',
    subsystemId: 'cooling',
    metricIds: ['thermal.coolant_temp'],
    shape: { type: 'rect', x: 566, y: 67, w: 214, h: 143, rx: 5 },
    labelPosition: { x: 673, y: 138 },
  },
  {
    zoneId: 'brakes',
    label: 'Brake System',
    shortLabel: 'Brakes',
    subsystemId: 'brakes',
    metricIds: ['pressure.brake_pipe', 'pressure.brake_main'],
    shape: { type: 'rect', x: 148, y: 209, w: 632, h: 11, rx: 3 },
    labelPosition: { x: 464, y: 216 },
  },
  {
    zoneId: 'traction',
    label: 'Traction Motors',
    shortLabel: 'Traction',
    subsystemId: 'electrical',
    metricIds: ['electrical.traction_current', 'electrical.traction_voltage'],
    // Compound path: two bogie positions
    shape: {
      type: 'path',
      d: 'M148,218 h160 v18 h-160 Z M572,218 h160 v18 h-160 Z',
    },
    labelPosition: { x: 228, y: 231 },
  },
]

export const ZONE_BY_ID: Record<string, DiagramZone> = Object.fromEntries(
  DIAGRAM_ZONES.map((z) => [z.zoneId, z])
)
