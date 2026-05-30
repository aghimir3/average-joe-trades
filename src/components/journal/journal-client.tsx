/**
 * Journal Client Component
 *
 * Main client component for the trading journal.
 * Features:
 * - Date navigation
 * - Daily journal form with pre/post market sections
 * - Health & wellness tracking
 * - Auto-save functionality
 */

'use client';

import { parseApiJson, apiMessage, apiData } from '@/lib/api/client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Activity,
  Brain,
  Loader2,
  Save,
  Coffee,
  Dumbbell,
  BedDouble,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { DatePicker } from '@/components/ui/date-picker';
import { getLocalDateString } from '@/lib/utils';

interface JournalEntry {
  id: string;
  date: string;
  preMarketNotes: string | null;
  preMarketMood: string | null;
  watchlist: string | null;
  keyLevels: string | null;
  hoursSlept: number | null;
  sleepQuality: string | null;
  exercised: boolean | null;
  caffeineIntake: string | null;
  stressLevel: number | null;
  postMarketNotes: string | null;
  emotionalState: string | null;
  followedPlan: boolean | null;
  biggestWin: string | null;
  biggestMistake: string | null;
  lessonsLearned: string | null;
  marketCondition: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JournalFormData {
  date: string;
  preMarketNotes: string;
  preMarketMood: string;
  watchlist: string;
  keyLevels: string;
  hoursSlept: number | null;
  sleepQuality: string;
  exercised: boolean;
  caffeineIntake: string;
  stressLevel: number;
  postMarketNotes: string;
  emotionalState: string;
  followedPlan: boolean;
  biggestWin: string;
  biggestMistake: string;
  lessonsLearned: string;
  marketCondition: string;
}

async function fetchJournalEntry(date: string): Promise<{ entry: JournalEntry | null; date: string }> {
  const response = await fetch(`/api/journal/${date}`);
  if (!response.ok) {
    throw new Error('Failed to fetch journal entry');
  }
  return apiData(await parseApiJson(response));
}

async function saveJournalEntry(data: JournalFormData): Promise<{ success: boolean; entry: JournalEntry }> {
  const response = await fetch('/api/journal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await parseApiJson(response);
    throw new Error(apiMessage(error, 'Failed to save journal entry'));
  }
  return apiData(await parseApiJson(response));
}

const defaultFormData: JournalFormData = {
  date: getLocalDateString(),
  preMarketNotes: '',
  preMarketMood: '',
  watchlist: '',
  keyLevels: '',
  hoursSlept: null,
  sleepQuality: '',
  exercised: false,
  caffeineIntake: '',
  stressLevel: 5,
  postMarketNotes: '',
  emotionalState: '',
  followedPlan: false,
  biggestWin: '',
  biggestMistake: '',
  lessonsLearned: '',
  marketCondition: '',
};

// Define which fields belong to each section
const preMarketFields: (keyof JournalFormData)[] = [
  'preMarketNotes',
  'preMarketMood',
  'watchlist',
  'keyLevels',
];

const healthFields: (keyof JournalFormData)[] = [
  'hoursSlept',
  'sleepQuality',
  'exercised',
  'caffeineIntake',
  'stressLevel',
];

const postMarketFields: (keyof JournalFormData)[] = [
  'postMarketNotes',
  'emotionalState',
  'followedPlan',
  'biggestWin',
  'biggestMistake',
  'lessonsLearned',
  'marketCondition',
];

type SectionType = 'preMarket' | 'health' | 'postMarket';

export function JournalClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Initialize from ?date= query param if present, otherwise use today
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window === 'undefined') return getLocalDateString();
    const dateParam = new URLSearchParams(window.location.search).get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return dateParam;
    return getLocalDateString();
  });

  // React to query param changes (e.g. navigating from History page)
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setSelectedDate(dateParam);
    }
  }, [searchParams]);
  const [formData, setFormData] = useState<JournalFormData>(defaultFormData);
  const [isDirty, setIsDirty] = useState(false);

  // Track dirty state per section
  const [sectionDirty, setSectionDirty] = useState<Record<SectionType, boolean>>({
    preMarket: false,
    health: false,
    postMarket: false,
  });

  // Track saving state per section
  const [sectionSaving, setSectionSaving] = useState<Record<SectionType, boolean>>({
    preMarket: false,
    health: false,
    postMarket: false,
  });

  // Fetch journal entry for selected date
  const { data, isLoading } = useQuery({
    queryKey: ['journal', selectedDate],
    queryFn: () => fetchJournalEntry(selectedDate),
  });

  // Update form when data loads
  const entry = data?.entry;
  if (entry && formData.date !== entry.date) {
    setFormData({
      date: entry.date,
      preMarketNotes: entry.preMarketNotes || '',
      preMarketMood: entry.preMarketMood || '',
      watchlist: entry.watchlist || '',
      keyLevels: entry.keyLevels || '',
      hoursSlept: entry.hoursSlept,
      sleepQuality: entry.sleepQuality || '',
      exercised: entry.exercised || false,
      caffeineIntake: entry.caffeineIntake || '',
      stressLevel: entry.stressLevel || 5,
      postMarketNotes: entry.postMarketNotes || '',
      emotionalState: entry.emotionalState || '',
      followedPlan: entry.followedPlan || false,
      biggestWin: entry.biggestWin || '',
      biggestMistake: entry.biggestMistake || '',
      lessonsLearned: entry.lessonsLearned || '',
      marketCondition: entry.marketCondition || '',
    });
    setIsDirty(false);
    setSectionDirty({ preMarket: false, health: false, postMarket: false });
  } else if (!entry && formData.date !== selectedDate) {
    setFormData({ ...defaultFormData, date: selectedDate });
    setIsDirty(false);
    setSectionDirty({ preMarket: false, health: false, postMarket: false });
  }

  // Save mutation (for "Save All" button)
  const saveMutation = useMutation({
    mutationFn: saveJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal', selectedDate] });
      setIsDirty(false);
      setSectionDirty({ preMarket: false, health: false, postMarket: false });
    },
  });

  const handleFieldChange = <K extends keyof JournalFormData>(
    field: K,
    value: JournalFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);

    // Track which section is dirty
    if (preMarketFields.includes(field)) {
      setSectionDirty((prev) => ({ ...prev, preMarket: true }));
    } else if (healthFields.includes(field)) {
      setSectionDirty((prev) => ({ ...prev, health: true }));
    } else if (postMarketFields.includes(field)) {
      setSectionDirty((prev) => ({ ...prev, postMarket: true }));
    }
  };

  const handleSave = () => {
    saveMutation.mutate({ ...formData, date: selectedDate });
  };

  const handleSaveSection = async (section: SectionType) => {
    setSectionSaving((prev) => ({ ...prev, [section]: true }));
    try {
      await saveJournalEntry({ ...formData, date: selectedDate });
      queryClient.invalidateQueries({ queryKey: ['journal', selectedDate] });
      setSectionDirty((prev) => ({ ...prev, [section]: false }));
      // Also update overall dirty state if no sections are dirty
      const otherSections = Object.entries(sectionDirty)
        .filter(([key]) => key !== section)
        .some(([, value]) => value);
      if (!otherSections) {
        setIsDirty(false);
      }
    } finally {
      setSectionSaving((prev) => ({ ...prev, [section]: false }));
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = parseISO(selectedDate);
    const newDate = direction === 'prev' ? subDays(current, 1) : addDays(current, 1);
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  };

  const goToToday = () => {
    setSelectedDate(getLocalDateString());
  };

  const displayDate = parseISO(selectedDate);

  return (
    <div className="space-y-8">
      {/* Date Navigation */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate('prev')}
              className="h-10 w-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {format(displayDate, 'EEEE, MMMM d, yyyy')}
                </p>
                {isToday(displayDate) && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Today
                  </span>
                )}
              </div>
              <DatePicker
                value={selectedDate}
                onChange={(date) => setSelectedDate(date)}
                maxDate={getLocalDateString()}
                placeholder="Select date"
              />
              {!isToday(displayDate) && (
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateDate('next')}
              disabled={isToday(displayDate)}
              className="h-10 w-10"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          {/* Pre-Market Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sun className="h-5 w-5 text-amber-500" />
                  Pre-Market
                </CardTitle>
                <Button
                  size="sm"
                  variant={sectionDirty.preMarket ? 'default' : 'ghost'}
                  onClick={() => handleSaveSection('preMarket')}
                  disabled={sectionSaving.preMarket || !sectionDirty.preMarket}
                  className={sectionDirty.preMarket ? 'bg-amber-600 hover:bg-amber-700' : ''}
                >
                  {sectionSaving.preMarket ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      {sectionDirty.preMarket ? 'Save' : 'Saved'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pb-8">
              <div className="space-y-2">
                <Label>Pre-Market Mood</Label>
                <Select
                  value={formData.preMarketMood}
                  onValueChange={(v) => handleFieldChange('preMarketMood', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="How are you feeling?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confident">Confident</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="cautious">Cautious</SelectItem>
                    <SelectItem value="anxious">Anxious</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Pre-Market Notes</Label>
                <Textarea
                  placeholder="Market outlook, key events, trading plan..."
                  value={formData.preMarketNotes}
                  onChange={(e) => handleFieldChange('preMarketNotes', e.target.value)}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>Watchlist</Label>
                  <Textarea
                    placeholder="AAPL, TSLA, SPY..."
                    value={formData.watchlist}
                    onChange={(e) => handleFieldChange('watchlist', e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Key Levels</Label>
                  <Textarea
                    placeholder="SPY 500, QQQ 420..."
                    value={formData.keyLevels}
                    onChange={(e) => handleFieldChange('keyLevels', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Health & Wellness Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  Health & Wellness
                </CardTitle>
                <Button
                  size="sm"
                  variant={sectionDirty.health ? 'default' : 'ghost'}
                  onClick={() => handleSaveSection('health')}
                  disabled={sectionSaving.health || !sectionDirty.health}
                  className={sectionDirty.health ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                >
                  {sectionSaving.health ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      {sectionDirty.health ? 'Save' : 'Saved'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4" />
                    Hours Slept
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="7.5"
                    value={formData.hoursSlept ?? ''}
                    onChange={(e) =>
                      handleFieldChange('hoursSlept', e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sleep Quality</Label>
                  <Select
                    value={formData.sleepQuality}
                    onValueChange={(v) => handleFieldChange('sleepQuality', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4" />
                    Exercised Today
                  </Label>
                  <div className="flex h-10 items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formData.exercised ? 'Yes' : 'No'}
                    </span>
                    <Switch
                      checked={formData.exercised}
                      onCheckedChange={(v: boolean) => handleFieldChange('exercised', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Coffee className="h-4 w-4" />
                    Caffeine Intake
                  </Label>
                  <Select
                    value={formData.caffeineIntake}
                    onValueChange={(v) => handleFieldChange('caffeineIntake', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select intake" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="light">Light (1 cup)</SelectItem>
                      <SelectItem value="moderate">Moderate (2-3 cups)</SelectItem>
                      <SelectItem value="heavy">Heavy (4+ cups)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stress Level */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Stress Level
                </Label>
                <div className="flex h-10 items-center gap-4 rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <Slider
                    value={[formData.stressLevel]}
                    onValueChange={([v]: number[]) => handleFieldChange('stressLevel', v)}
                    min={1}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 min-w-12 text-right">
                    {formData.stressLevel}/10
                  </span>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
                  <span>Calm</span>
                  <span>Very Stressed</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Post-Market Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Moon className="h-5 w-5 text-indigo-500" />
                  Post-Market Review
                </CardTitle>
                <Button
                  size="sm"
                  variant={sectionDirty.postMarket ? 'default' : 'ghost'}
                  onClick={() => handleSaveSection('postMarket')}
                  disabled={sectionSaving.postMarket || !sectionDirty.postMarket}
                  className={sectionDirty.postMarket ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                >
                  {sectionSaving.postMarket ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      {sectionDirty.postMarket ? 'Save' : 'Saved'}
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>Market Condition</Label>
                  <Select
                    value={formData.marketCondition}
                    onValueChange={(v) => handleFieldChange('marketCondition', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="How was the market?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bullish">Bullish</SelectItem>
                      <SelectItem value="bearish">Bearish</SelectItem>
                      <SelectItem value="choppy">Choppy</SelectItem>
                      <SelectItem value="trending">Trending</SelectItem>
                      <SelectItem value="ranging">Ranging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Emotional State</Label>
                  <Select
                    value={formData.emotionalState}
                    onValueChange={(v) => handleFieldChange('emotionalState', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="How did you feel?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="calm">Calm</SelectItem>
                      <SelectItem value="disciplined">Disciplined</SelectItem>
                      <SelectItem value="frustrated">Frustrated</SelectItem>
                      <SelectItem value="greedy">Greedy</SelectItem>
                      <SelectItem value="fearful">Fearful</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Did you follow your trading plan?</Label>
                <div className="flex h-10 items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {formData.followedPlan ? 'Yes' : 'No'}
                  </span>
                  <Switch
                    checked={formData.followedPlan}
                    onCheckedChange={(v: boolean) => handleFieldChange('followedPlan', v)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Post-Market Notes</Label>
                <Textarea
                  placeholder="How did the day go? What happened?"
                  value={formData.postMarketNotes}
                  onChange={(e) => handleFieldChange('postMarketNotes', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-emerald-600 dark:text-emerald-400">Biggest Win</Label>
                  <Textarea
                    placeholder="What went well today?"
                    value={formData.biggestWin}
                    onChange={(e) => handleFieldChange('biggestWin', e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-red-600 dark:text-red-400">Biggest Mistake</Label>
                  <Textarea
                    placeholder="What could you improve?"
                    value={formData.biggestMistake}
                    onChange={(e) => handleFieldChange('biggestMistake', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-blue-600 dark:text-blue-400">Lessons Learned</Label>
                <Textarea
                  placeholder="Key takeaways from today..."
                  value={formData.lessonsLearned}
                  onChange={(e) => handleFieldChange('lessonsLearned', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
              className="min-w-30 bg-emerald-600 hover:bg-emerald-700"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isDirty ? 'Save Changes' : 'Saved'}
                </>
              )}
            </Button>
          </div>

          {saveMutation.isError && (
            <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : 'Failed to save journal entry'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
