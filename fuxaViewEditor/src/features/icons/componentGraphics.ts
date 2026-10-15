import type { IconLibraryEntry } from '../../domain/icons/iconLibrary'
import type { GeneratedComponent } from '../../domain/svg/validateGeneratedView'

export interface ComponentGraphicChoice {
  value: string
  label: string
  disabled?: boolean
}

export function getComponentGraphicChoices(
  icons: readonly IconLibraryEntry[],
  component: GeneratedComponent,
  canUsePair: boolean,
): ComponentGraphicChoice[] {
  const choices: ComponentGraphicChoice[] = [
    { value: 'rect', label: '矩形' },
    { value: 'cylinder', label: '圓柱' },
    ...icons
      .filter((icon) => icon.type !== 'pair')
      .map((icon) => ({ value: `icon:${icon.id}`, label: icon.name })),
    ...icons
      .filter((icon) => icon.type === 'pair')
      .map((icon) => ({
        value: `pair:${icon.id}`,
        label: `${icon.name}（正常／告警）`,
        disabled: !canUsePair && component.template !== 'icon-pair',
      })),
  ]

  if (component.template === 'icon' && component.iconId
      && !icons.some((icon) => icon.type !== 'pair' && icon.id === component.iconId)) {
    choices.push({
      value: `icon:${component.iconId}`,
      label: `圖示不存在（${component.iconId}）`,
    })
  }
  if (component.template === 'icon-pair'
      && !icons.some((icon) => icon.type === 'pair'
        && icon.normal.id === component.normalIconId
        && icon.alarm.id === component.alarmIconId)) {
    const normal = icons.find((icon) => icon.type === 'pair'
      ? icon.normal.id === component.normalIconId || icon.alarm.id === component.normalIconId
      : icon.id === component.normalIconId)
    const alarm = icons.find((icon) => icon.type === 'pair'
      ? icon.normal.id === component.alarmIconId || icon.alarm.id === component.alarmIconId
      : icon.id === component.alarmIconId)
    choices.push({
      value: `pair:legacy:${component.normalIconId}:${component.alarmIconId}`,
      label: `${normal?.name ?? '缺少正常圖'} / ${alarm?.name ?? '缺少告警圖'}（舊圖示組）`,
    })
  }
  return choices
}

export function selectedComponentGraphic(
  component: GeneratedComponent,
  icons: readonly IconLibraryEntry[],
): string {
  if (component.template === 'icon' && component.iconId) return `icon:${component.iconId}`
  if (component.template === 'icon-pair') {
    const pair = icons.find((icon) => icon.type === 'pair'
      && icon.normal.id === component.normalIconId
      && icon.alarm.id === component.alarmIconId)
    return pair
      ? `pair:${pair.id}`
      : `pair:legacy:${component.normalIconId || ''}:${component.alarmIconId || ''}`
  }
  return component.template || 'rect'
}

export function updateComponentGraphic(
  component: GeneratedComponent,
  value: string,
  icons: readonly IconLibraryEntry[],
  createAlarmShapeId: () => string,
): GeneratedComponent {
  const next = { ...component }
  if (value.startsWith('icon:')) {
    const iconId = value.slice('icon:'.length)
    const icon = icons.find((candidate) => candidate.type !== 'pair' && candidate.id === iconId)
    if (!icon) {
      if (component.template === 'icon' && component.iconId === iconId) return next
      throw new Error('找不到所選的一般圖示。')
    }
    if (component.template === 'icon' && component.iconId === iconId) return next
    next.template = 'icon'
    next.iconId = iconId
    delete next.normalIconId
    delete next.alarmIconId
    delete next.invertIconState
    delete next.alarmShapeId
    return next
  }

  if (value.startsWith('pair:')) {
    const selected = value.slice('pair:'.length)
    const pair = icons.find((candidate) => candidate.type === 'pair' && candidate.id === selected)
    const legacyPair = selected.startsWith('legacy:')
      ? selected.slice('legacy:'.length).split(':')
      : null
    const normalIconId = pair?.type === 'pair' ? pair.normal.id : legacyPair?.[0]
    const alarmIconId = pair?.type === 'pair' ? pair.alarm.id : legacyPair?.[1]
    if (!normalIconId || !alarmIconId) throw new Error('找不到所選的正常／告警圖示組。')
    if (component.template === 'icon-pair'
        && component.normalIconId === normalIconId
        && component.alarmIconId === alarmIconId) return next
    next.template = 'icon-pair'
    next.normalIconId = normalIconId
    next.alarmIconId = alarmIconId
    next.alarmShapeId = component.alarmShapeId || createAlarmShapeId()
    delete next.iconId
    return next
  }

  if (value !== 'rect' && value !== 'cylinder') {
    throw new Error('所選圖形無效。')
  }
  if (component.template === value) return next
  next.template = value
  delete next.iconId
  delete next.normalIconId
  delete next.alarmIconId
  delete next.invertIconState
  delete next.alarmShapeId
  return next
}
