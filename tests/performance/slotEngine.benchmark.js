import { computeSlots } from "../../src/utils/slotEngine.js";

function benchmark(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();
  const avgMs = (end - start) / iterations;

  console.log(`\n${name}:`);
  console.log(`  Total: ${(end - start).toFixed(2)}ms`);
  console.log(`  Average: ${avgMs.toFixed(4)}ms`);
  console.log(`  Ops/sec: ${(1000 / avgMs).toFixed(0)}`);
}

console.log("=== Slot Engine Performance Benchmark ===\n");

// Test 1: Basic scenario (no appointments, no breaks)
const basicSpecialist = {
  _id: "spec1",
  workingHours: {
    mon: { start: "09:00", end: "17:00", breaks: [] },
  },
  timeOff: [],
};

const basicVariant = {
  durationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
};

benchmark(
  "Basic (no appointments, no breaks)",
  () => {
    computeSlots({
      specialist: basicSpecialist,
      variant: basicVariant,
      date: "2025-12-23", // Monday
      appointments: [],
    });
  },
  1000
);

// Test 2: With breaks
const specialistWithBreaks = {
  ...basicSpecialist,
  workingHours: {
    mon: {
      start: "09:00",
      end: "17:00",
      breaks: [
        { start: "11:00", end: "11:15" },
        { start: "13:00", end: "14:00" },
        { start: "15:30", end: "15:45" },
      ],
    },
  },
};

benchmark(
  "With 3 breaks",
  () => {
    computeSlots({
      specialist: specialistWithBreaks,
      variant: basicVariant,
      date: "2025-12-23",
      appointments: [],
    });
  },
  1000
);

// Test 3: With many appointments (stress test)
const manyAppointments = Array.from({ length: 100 }, (_, i) => ({
  start: new Date(`2025-12-23T${9 + Math.floor(i / 8)}:${(i % 8) * 7}:00.000Z`),
  end: new Date(
    `2025-12-23T${9 + Math.floor(i / 8)}:${(i % 8) * 7 + 30}:00.000Z`
  ),
}));

benchmark(
  "With 100 appointments",
  () => {
    computeSlots({
      specialist: basicSpecialist,
      variant: basicVariant,
      date: "2025-12-23",
      appointments: manyAppointments,
    });
  },
  1000
);

// Test 4: With many time-off periods
const specialistWithTimeOff = {
  ...basicSpecialist,
  timeOff: Array.from({ length: 50 }, (_, i) => ({
    start: new Date(`2025-12-${1 + i}T09:00:00.000Z`),
    end: new Date(`2025-12-${1 + i}T17:00:00.000Z`),
  })),
};

benchmark(
  "With 50 time-off periods",
  () => {
    computeSlots({
      specialist: specialistWithTimeOff,
      variant: basicVariant,
      date: "2025-12-23",
      appointments: [],
    });
  },
  1000
);

// Test 5: Complex scenario (everything combined)
const complexSpecialist = {
  ...basicSpecialist,
  workingHours: {
    mon: {
      start: "08:00",
      end: "20:00",
      breaks: [
        { start: "10:00", end: "10:15" },
        { start: "12:00", end: "13:00" },
        { start: "15:00", end: "15:15" },
        { start: "17:30", end: "17:45" },
      ],
    },
  },
  timeOff: Array.from({ length: 20 }, (_, i) => ({
    start: new Date(`2025-12-${1 + i}T00:00:00.000Z`),
    end: new Date(`2025-12-${1 + i}T23:59:59.999Z`),
  })),
};

const complexAppointments = Array.from({ length: 50 }, (_, i) => ({
  start: new Date(
    `2025-12-23T${8 + Math.floor(i / 6)}:${(i % 6) * 10}:00.000Z`
  ),
  end: new Date(
    `2025-12-23T${8 + Math.floor(i / 6)}:${(i % 6) * 10 + 45}:00.000Z`
  ),
}));

benchmark(
  "Complex (50 appointments + 20 time-offs + 4 breaks)",
  () => {
    computeSlots({
      specialist: complexSpecialist,
      variant: { ...basicVariant, durationMin: 45 },
      date: "2025-12-23",
      appointments: complexAppointments,
    });
  },
  1000
);

// Test 6: Small step size (15 min slots)
const smallStepVariant = {
  durationMin: 30,
  bufferBeforeMin: 5,
  bufferAfterMin: 5,
};

benchmark(
  "With 15-min steps (30+10 min duration)",
  () => {
    computeSlots({
      specialist: basicSpecialist,
      variant: smallStepVariant,
      date: "2025-12-23",
      appointments: [],
      stepMin: 15,
    });
  },
  1000
);

// Test 7: Extended hours (12 hour day)
const extendedHoursSpecialist = {
  ...basicSpecialist,
  workingHours: {
    mon: { start: "07:00", end: "21:00", breaks: [] },
  },
};

benchmark(
  "Extended hours (7am-9pm, 14 hours)",
  () => {
    computeSlots({
      specialist: extendedHoursSpecialist,
      variant: basicVariant,
      date: "2025-12-23",
      appointments: [],
    });
  },
  1000
);

// Test 8: Memory allocation test
console.log("\n=== Memory & Scalability Test ===\n");

const scales = [10, 50, 100, 200, 500];
scales.forEach((count) => {
  const appointments = Array.from({ length: count }, (_, i) => ({
    start: new Date(
      `2025-12-23T${9 + Math.floor((i * 30) / 60)}:${(i * 30) % 60}:00.000Z`
    ),
    end: new Date(
      `2025-12-23T${9 + Math.floor((i * 30 + 25) / 60)}:${
        (i * 30 + 25) % 60
      }:00.000Z`
    ),
  }));

  const start = performance.now();
  const result = computeSlots({
    specialist: basicSpecialist,
    variant: basicVariant,
    date: "2025-12-23",
    appointments,
  });
  const time = performance.now() - start;

  console.log(
    `${count} appointments: ${time.toFixed(2)}ms (${
      result.length
    } slots generated)`
  );
});

console.log("\n=== Benchmark Complete ===\n");
