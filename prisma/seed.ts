import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@morningform.com' },
    update: {},
    create: {
      email: 'demo@morningform.com',
      name: 'Demo User',
    },
  });

  await prisma.assessmentResponse.upsert({
    where: { userId: user.id },
    update: {
      responses: JSON.stringify({
        primary_goal: 'focus',
        friction_point: 'wired_tired',
        wake_time: '07:00',
        sleep_time: '22:45',
        sleep_quality: 2,
        night_waking: '1_2',
        stimulant_sensitivity: 'moderate',
        stress_level: 4,
      }),
    },
    create: {
      userId: user.id,
      responses: JSON.stringify({
        primary_goal: 'focus',
        friction_point: 'wired_tired',
        wake_time: '07:00',
        sleep_time: '22:45',
        sleep_quality: 2,
        night_waking: '1_2',
        stimulant_sensitivity: 'moderate',
        stress_level: 4,
      }),
    },
  });

  await prisma.stateProfile.upsert({
    where: { userId: user.id },
    update: {
      archetype: 'sustained-activator',
      primaryPattern: 'Sustained activation with impaired downshift',
      patternDescription:
        'You maintain high output during the day but struggle to transition into rest. Your system stays on longer than it should.',
      observations: JSON.stringify([
        'High afternoon energy but poor sleep onset',
        'Moderate-high stimulant sensitivity',
        'Below-baseline recovery perception',
      ]),
      constraints: JSON.stringify(['Caffeine cutoff recommended before 1pm']),
      sensitivities: JSON.stringify(['Stimulant sensitivity', 'Stress reactivity']),
    },
    create: {
      userId: user.id,
      archetype: 'sustained-activator',
      primaryPattern: 'Sustained activation with impaired downshift',
      patternDescription:
        'You maintain high output during the day but struggle to transition into rest. Your system stays on longer than it should.',
      observations: JSON.stringify([
        'High afternoon energy but poor sleep onset',
        'Moderate-high stimulant sensitivity',
        'Below-baseline recovery perception',
      ]),
      constraints: JSON.stringify(['Caffeine cutoff recommended before 1pm']),
      sensitivities: JSON.stringify(['Stimulant sensitivity', 'Stress reactivity']),
    },
  });

  await prisma.protocol.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      version: 1,
      status: 'active',
      rationale:
        'Morning activation support, midday transition buffering, and structured evening downshift for sustained output with better sleep onset.',
      confidence: 'high',
      items: {
        create: [
          {
            timeSlot: 'morning',
            timeLabel: 'Morning — Activation Support',
            compounds: 'L-Tyrosine + Alpha-GPC',
            dosage: '500mg + 300mg',
            timingCue: 'Before breakfast',
            mechanism: 'Supports dopamine and acetylcholine synthesis for sustained focus.',
            evidenceTier: 'strong',
            sortOrder: 0,
          },
          {
            timeSlot: 'afternoon',
            timeLabel: 'Afternoon — Transition Buffer',
            compounds: 'L-Theanine',
            dosage: '200mg',
            timingCue: 'After lunch',
            mechanism: 'Smooths the cortisol curve without sedation.',
            evidenceTier: 'strong',
            sortOrder: 1,
          },
          {
            timeSlot: 'evening',
            timeLabel: 'Evening — Downshift Protocol',
            compounds: 'Magnesium L-Threonate + Apigenin',
            dosage: '200mg + 50mg',
            timingCue: '90 minutes before bed',
            mechanism: 'Supports GABA activity and melatonin onset.',
            evidenceTier: 'strong',
            sortOrder: 2,
          },
        ],
      },
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      wakeTime: '07:00',
      windDownTime: '22:00',
      timezone: 'Europe/London',
    },
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: 'whoop' } },
    update: { status: 'connected', lastSyncAt: new Date() },
    create: { userId: user.id, provider: 'whoop', status: 'connected', lastSyncAt: new Date() },
  });

  await prisma.healthConnection.upsert({
    where: { userId_provider: { userId: user.id, provider: 'oura' } },
    update: { status: 'connected', lastSyncAt: new Date() },
    create: { userId: user.id, provider: 'oura', status: 'connected', lastSyncAt: new Date() },
  });

  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  for (const date of dates) {
    const dateKey = date.toISOString().split('T')[0];
    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'morning',
        date: dateKey,
        responses: JSON.stringify({
          sleepQuality: ['ok', 'well', 'great'][Math.floor(Math.random() * 3)],
          currentFeeling: ['flat', 'steady', 'sharp'][Math.floor(Math.random() * 3)],
        }),
      },
    });

    await prisma.checkIn.create({
      data: {
        userId: user.id,
        type: 'evening',
        date: dateKey,
        responses: JSON.stringify({
          focusQuality: ['variable', 'good', 'locked-in'][Math.floor(Math.random() * 3)],
          afternoonEnergy: ['dipped', 'steady', 'strong'][Math.floor(Math.random() * 3)],
          protocolAdherence: ['mostly', 'fully'][Math.floor(Math.random() * 2)],
        }),
      },
    });

    await prisma.healthDataPoint.createMany({
      data: [
        {
          userId: user.id,
          provider: 'whoop',
          category: 'recovery',
          metric: 'hrv',
          value: 58 + Math.round(Math.random() * 15),
          unit: 'ms',
          timestamp: date,
        },
        {
          userId: user.id,
          provider: 'oura',
          category: 'sleep',
          metric: 'duration',
          value: 6.8 + Math.random() * 1.2,
          unit: 'hours',
          timestamp: date,
        },
      ],
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
