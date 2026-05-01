import { Users, Clock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { KpiCard } from '@/components/KpiCard';
import { ProjectFilterBadge } from '@/components/ProjectFilterBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockResourceSummary, mockKpis } from '@/lib/mock-data';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const chartConfig = {
  forecasted: { label: 'Forecasted', color: 'hsl(var(--chart-1))' },
  billed: { label: 'Billed', color: 'hsl(var(--chart-2))' },
};

const levelData = mockResourceSummary.reduce((acc, r) => {
  const existing = acc.find((a) => a.name === r.level);
  if (existing) existing.value += r.billedHours;
  else acc.push({ name: r.level, value: r.billedHours });
  return acc;
}, [] as { name: string; value: number }[]);

const PIE_COLORS = ['hsl(221,83%,53%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(280,67%,60%)'];

const barData = mockResourceSummary.slice(0, 8).map((r) => ({
  name: r.resourceName.split(' ')[1],
  forecasted: r.forecastedHours,
  billed: r.billedHours,
}));

export default function HoursRecon() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hours Reconciliation</h1>
        <p className="text-muted-foreground mt-1">Compare forecasted vs. billed hours across resources</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard title="Total Resources" value={mockKpis.totalResources} icon={Users} />
        <KpiCard title="Forecasted Hours" value={mockKpis.totalForecasted} icon={Clock} />
        <KpiCard title="Billed Hours" value={mockKpis.totalBilled} icon={TrendingUp} />
        <KpiCard
          title="Overall Variance"
          value={mockKpis.overallVariance}
          icon={TrendingDown}
          trend={mockKpis.overallVariance > 0 ? 'negative' : 'positive'}
        />
        <KpiCard
          title="Billing Violations"
          value={mockKpis.billingViolations}
          icon={AlertTriangle}
          trend={mockKpis.billingViolations > 0 ? 'negative' : 'positive'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Forecasted vs. Billed Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="forecasted" fill="var(--color-forecasted)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hours by Level</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <PieChart>
                <Pie data={levelData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                  {levelData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap gap-3 mt-2 justify-center">
              {levelData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resource Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Forecasted</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead className="text-center">Flex</TableHead>
                <TableHead className="text-center">Violation</TableHead>
                <TableHead className="text-center">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockResourceSummary.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.project}</TableCell>
                  <TableCell>
                    {r.resourceName}
                    {r.billingWithoutForecast && <span className="text-destructive ml-1">*</span>}
                  </TableCell>
                  <TableCell>{r.level}</TableCell>
                  <TableCell className="text-right">{r.forecastedHours}</TableCell>
                  <TableCell className="text-right">{r.billedHours}</TableCell>
                  <TableCell className={`text-right font-medium ${r.difference > 0 ? 'text-destructive' : 'text-success'}`}>
                    {r.difference > 0 ? '+' : ''}{r.difference}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.isFlex ? 'default' : 'secondary'} className="text-xs">
                      {r.isFlex ? 'Yes' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {r.hasBillingViolation ? (
                      <Badge variant="destructive" className="text-xs">Yes</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.isActive ? 'default' : 'secondary'} className="text-xs">
                      {r.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
