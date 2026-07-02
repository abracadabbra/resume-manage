declare module 'vue-virtual-scroller' {
  import type { DefineComponent } from 'vue'

  interface RecycleScrollerProps {
    items: unknown[]
    itemSize: number | string
    keyField: string
    typeField?: string
    direction?: 'vertical' | 'horizontal'
    buffer?: number
    pageMode?: boolean
    prerender?: number
    emitUpdate?: boolean
    listClass?: string
    itemClass?: string
    listTag?: string
    itemTag?: string
    gridItems?: number
    minItemSize?: number | string
    sizeField?: string
    skipHover?: boolean
  }

  export const RecycleScroller: DefineComponent<RecycleScrollerProps>
  export const DynamicScroller: DefineComponent<RecycleScrollerProps & { minItemSize: number | string }>
  export const DynamicScrollerItem: DefineComponent<{ item: unknown; active: boolean; dataIndex: string }>
}