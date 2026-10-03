// Adapted from Comparison 2 by Hirael <https://hirael.com/blocks/comparison/comparison-02>
// MIT · Mohammad Shehadeh · https://github.com/MohammadShehadeh/hirael
import { Check, Minus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
type Cell = boolean | string
interface Column { name: string; summary: string; price: number; total: number; href: string; featured?: boolean }
const COLUMNS: readonly Column[] = [
  { name: 'Essential', summary: 'A simple website for your local service business', price: 39, total: 468, href: '/essential' },
  { name: 'Growth', summary: 'More pages, content control and enquiry insights', price: 59, total: 708, href: '/growth', featured: true },
]
const ROWS: readonly { label: string; cells: readonly [Cell, Cell] }[] = [
  { label: 'Plan highlights', cells: ['Contact form, WhatsApp & basic SEO', 'CMS, analytics & conversion tracking'] },
  { label: 'Website pages', cells: ['Up to 3', 'Up to 5'] },
  { label: 'Mobile-responsive design', cells: [true, true] },
  { label: 'Hosting & SSL', cells: [true, true] },
  { label: 'Technical maintenance', cells: [true, true] },
  { label: 'Full CMS access', cells: [false, true] },
  { label: 'Google Analytics & Search Console', cells: [false, true] },
  { label: 'Enquiry & conversion tracking', cells: [false, true] },
  { label: 'Setup fee', cells: ['None', 'None'] },
  { label: 'Domain name', cells: ['Purchased separately', 'Purchased separately'] },
]
const CellValue = ({ value }: { value: Cell }) => typeof value === 'string' ? <span className="text-sm text-muted-foreground">{value}</span> : value ? <><Check aria-hidden className="size-4 text-foreground" /><span className="sr-only">Included</span></> : <><Minus aria-hidden className="size-4 text-muted-foreground/50" /><span className="sr-only">Not included</span></>
export default function Comparison02() {
 return <section className="comparison-block bg-background py-12 sm:py-20" aria-labelledby="comparison-02-heading">
  <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
   <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Find your fit</p><h1 id="comparison-02-heading" className="mt-3 text-3xl font-medium tracking-tight sm:text-5xl">Two plans. One clearer choice.</h1><p className="mt-4 text-muted-foreground">A professional website for your local business. Compare what’s included and choose the level that suits you.</p></div>
   <p className="mt-8 text-center text-sm text-muted-foreground">12-month minimum · No setup fee · Hosting &amp; SSL included</p>
   <div className="mt-8 overflow-x-auto rounded-xl" role="region" aria-label="Plan comparison; scroll horizontally on small screens" tabIndex={0}>
    <table className="w-full min-w-[36rem] border-collapse text-start"><caption className="sr-only">Essential and Growth website plan features, prices and subscription links</caption><thead><tr><th scope="col" className="w-1/3 p-4 text-start align-bottom"><span className="text-xs uppercase tracking-widest text-muted-foreground">What’s included</span></th>{COLUMNS.map(column => <th key={column.name} scope="col" className={cn('w-1/3 p-4 text-start align-bottom', column.featured && 'rounded-t-md border border-b-0 border-border bg-card')}><span className="flex flex-wrap items-center gap-2"><span className="text-lg font-medium">{column.name}</span>{column.featured && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Most popular</Badge>}</span><span className="mt-2 block text-sm font-normal text-muted-foreground">{column.summary}</span><span className="mt-4 block text-3xl font-semibold">£{column.price}<span className="text-sm font-normal text-muted-foreground">/month</span></span><span className="mt-1 block text-xs font-normal text-muted-foreground">£{column.total} over 12 payments</span></th>)}</tr></thead>
    <tbody>{ROWS.map(row => <tr key={row.label} className="border-t border-border"><th scope="row" className="p-4 text-start text-sm font-normal">{row.label}</th>{row.cells.map((cell,index) => <td key={COLUMNS[index].name} className={cn('p-4 align-middle', COLUMNS[index].featured && 'border-x border-border bg-card')}><span className="flex items-center"><CellValue value={cell}/></span></td>)}</tr>)}<tr className="border-t border-border"><td/>{COLUMNS.map(column => <td key={column.name} className={cn('p-4',column.featured && 'rounded-b-md border-x border-b border-border bg-card')}><Button asChild size="sm" className="w-full"><a href={`/pay/${column.name.toLowerCase()}`} target="_blank" rel="noopener" data-subscribe-cta data-location={`compare_${column.name.toLowerCase()}`}>Subscribe - £{column.price}/month</a></Button><a href={column.href} className="mt-3 block text-center text-sm underline underline-offset-4">View plan details</a></td>)}</tr></tbody></table>
   </div>
   <p className="mt-3 text-center text-xs text-muted-foreground sm:hidden">Swipe the table to compare both plans.</p>
   <div className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground"><p>After the first 12 months, billing continues monthly. Cancel with 30 days’ notice after the initial term. <a href="/terms" className="underline underline-offset-4">Read the full terms.</a></p><p className="mt-4">Prefer to try it first? <a href="/#get-started" className="font-medium text-foreground underline underline-offset-4">Start with a £5 homepage preview.</a></p></div>
  </div>
 </section>
}
