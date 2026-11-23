import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'lablink.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      email TEXT,
      usn TEXT DEFAULT '',
      department TEXT DEFAULT '',
      academic_year INTEGER,
      semester INTEGER,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'faculty', 'admin')),
      verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
      is_active INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
    CREATE INDEX IF NOT EXISTS idx_profiles_norm_name ON profiles(normalized_name);

    -- Server-side hashed passcodes for Faculty and Admin portals
    CREATE TABLE IF NOT EXISTS portal_credentials (
      role TEXT PRIMARY KEY CHECK (role IN ('faculty', 'admin')),
      password_hash TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT 'system',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campus_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campus_floors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES campus_blocks(id) ON DELETE CASCADE,
      floor_number INTEGER NOT NULL,
      label TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(block_id, floor_number)
    );

    CREATE TABLE IF NOT EXISTS lab_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_id INTEGER NOT NULL REFERENCES campus_blocks(id) ON DELETE CASCADE,
      floor_id INTEGER NOT NULL REFERENCES campus_floors(id) ON DELETE CASCADE,
      room_number TEXT NOT NULL,
      lab_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'unavailable', 'maintenance')),
      is_active INTEGER NOT NULL DEFAULT 1,
      open_hour INTEGER NOT NULL DEFAULT 9,
      close_hour INTEGER NOT NULL DEFAULT 17,
      saturday_open_hour INTEGER NOT NULL DEFAULT 9,
      saturday_close_hour INTEGER NOT NULL DEFAULT 17,
      sunday_closed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(block_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS lab_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT NOT NULL,
      room_id INTEGER REFERENCES lab_rooms(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '/equipment/hero-lab.jpg',
      room_id INTEGER REFERENCES lab_rooms(id) ON DELETE SET NULL,
      bench_location TEXT NOT NULL DEFAULT '',
      specs_json TEXT NOT NULL DEFAULT '{}',
      requires_certification INTEGER NOT NULL DEFAULT 0,
      certification_name TEXT,
      compatible_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS equipment_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      unit_code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'damaged')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS equipment_location_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      from_room_id INTEGER REFERENCES lab_rooms(id) ON DELETE SET NULL,
      to_room_id INTEGER REFERENCES lab_rooms(id) ON DELETE SET NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      moved_by TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      moved_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      student_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      certification_name TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(normalized_name, certification_name)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      student_usn TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL,
      project_description TEXT NOT NULL,
      project_deadline TEXT NOT NULL,
      reason TEXT NOT NULL,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES equipment_units(id) ON DELETE CASCADE,
      room_id INTEGER REFERENCES lab_rooms(id) ON DELETE SET NULL,
      snapshot_block_name TEXT NOT NULL DEFAULT '',
      snapshot_floor_name TEXT NOT NULL DEFAULT '',
      snapshot_room_number TEXT NOT NULL DEFAULT '',
      snapshot_lab_name TEXT NOT NULL DEFAULT '',
      snapshot_bench_location TEXT NOT NULL DEFAULT '',
      booking_date TEXT NOT NULL,
      start_hour INTEGER NOT NULL,
      end_hour INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled', 'no_show')),
      deadline_urgency REAL NOT NULL DEFAULT 0.5,
      usage_fairness REAL NOT NULL DEFAULT 1.0,
      priority_score REAL NOT NULL DEFAULT 0.7,
      safety_eligible INTEGER NOT NULL DEFAULT 1,
      allocation_notes TEXT NOT NULL DEFAULT '',
      rejection_reason TEXT,
      suggested_slot TEXT,
      agreement_accepted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_unit_date_status ON bookings(unit_id, booking_date, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);

    CREATE TABLE IF NOT EXISTS responsibility_agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      booking_date TEXT NOT NULL,
      agreement_text TEXT NOT NULL,
      accepted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS damage_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      unit_id INTEGER NOT NULL REFERENCES equipment_units(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      description TEXT NOT NULL,
      reported_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported', 'Under Investigation', 'Resolved', 'Maintenance Required')),
      investigation_findings TEXT,
      responsibility_decision TEXT CHECK (responsibility_decision IN ('misuse', 'negligence', 'normal_wear', 'equipment_fault')),
      faculty_notes TEXT,
      resolved_by TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      unit_id INTEGER REFERENCES equipment_units(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'resolved')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rescue_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      trigger_reason TEXT NOT NULL,
      original_equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      proposed_equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      proposed_unit_id INTEGER NOT NULL REFERENCES equipment_units(id) ON DELETE CASCADE,
      proposed_date TEXT NOT NULL,
      proposed_start_hour INTEGER NOT NULL,
      proposed_end_hour INTEGER NOT NULL,
      compatibility_explanation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_student' CHECK (status IN ('pending_student', 'accepted', 'pending_faculty', 'resolved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT,
      student_name TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      related_booking_id INTEGER,
      rescue_proposal_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInitialDemoCatalogIfEmpty();
}

function seedInitialDemoCatalogIfEmpty(): void {
  const blocksCountRow = db.prepare('SELECT COUNT(*) as c FROM campus_blocks').get() as { c: number };
  const equipCountRow = db.prepare('SELECT COUNT(*) as c FROM equipment').get() as { c: number };
  if (blocksCountRow.c > 0 || equipCountRow.c > 0) return;

  const insertDemo = db.transaction(() => {
    // Clearly labeled, Admin-editable Demo Blocks / Floors / Rooms (zero hardcoded college names)
    const b1 = Number(
      db
        .prepare('INSERT INTO campus_blocks (name, code, description) VALUES (?, ?, ?)')
        .run('Demo Engineering Wing A', 'DEMO-A', 'Demo block — edit or rename in Admin Dashboard')
        .lastInsertRowid
    );
    const b2 = Number(
      db
        .prepare('INSERT INTO campus_blocks (name, code, description) VALUES (?, ?, ?)')
        .run('Demo Innovation Wing B', 'DEMO-B', 'Demo block — edit or rename in Admin Dashboard')
        .lastInsertRowid
    );

    const fA1 = Number(
      db
        .prepare('INSERT INTO campus_floors (block_id, floor_number, label) VALUES (?, ?, ?)')
        .run(b1, 1, 'Floor 1')
        .lastInsertRowid
    );
    const fA2 = Number(
      db
        .prepare('INSERT INTO campus_floors (block_id, floor_number, label) VALUES (?, ?, ?)')
        .run(b1, 2, 'Floor 2')
        .lastInsertRowid
    );
    const fB1 = Number(
      db
        .prepare('INSERT INTO campus_floors (block_id, floor_number, label) VALUES (?, ?, ?)')
        .run(b2, 1, 'Floor 1')
        .lastInsertRowid
    );

    const insertRoom = db.prepare(
      `INSERT INTO lab_rooms
        (block_id, floor_id, room_number, lab_name, status, is_active, open_hour, close_hour, saturday_open_hour, saturday_close_hour, sunday_closed)
       VALUES (?, ?, ?, ?, 'available', 1, 9, 17, 9, 17, 1)`
    );

    const rElec = Number(insertRoom.run(b1, fA1, 'D-101', 'Electronics & Instrumentation Lab (Demo)').lastInsertRowid);
    const rEmb = Number(insertRoom.run(b1, fA2, 'D-201', 'Embedded Systems & FPGA Lab (Demo)').lastInsertRowid);
    const rIot = Number(insertRoom.run(b1, fA2, 'D-204', 'IoT & Microcontroller Prototyping Lab (Demo)').lastInsertRowid);
    const rRobo = Number(insertRoom.run(b2, fB1, 'D-105', 'Robotics & Mechatronics Lab (Demo)').lastInsertRowid);
    const rMech = Number(insertRoom.run(b2, fB1, 'D-108', 'Digital Fabrication & CNC Lab (Demo)').lastInsertRowid);
    const rComp = Number(insertRoom.run(b2, fB1, 'D-112', 'Computing, Simulation & PPT/Report Lab (Demo)').lastInsertRowid);

    const insertEquip = db.prepare(
      `INSERT INTO equipment
        (slug, name, category, description, image_url, room_id, bench_location, specs_json, requires_certification, certification_name, compatible_ids_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertUnit = db.prepare(
      'INSERT INTO equipment_units (equipment_id, unit_code, status, notes) VALUES (?, ?, ?, ?)'
    );

    const items = [
      {
        slug: 'keysight-dsox1204g-oscilloscope',
        name: 'Keysight DSOX1204G Digital Storage Oscilloscope',
        category: 'Electronics',
        description:
          '4-channel 100 MHz mixed-signal benchtop oscilloscope with SPI, I2C, and UART hardware protocol decoding and built-in 20 MHz waveform generator.',
        imageUrl: '/equipment/oscilloscope.jpg',
        roomId: rElec,
        bench: 'Bench E1 (Demo)',
        specs: {
          bandwidth: '100 MHz',
          channels: '4 Analog Channels',
          samplingRate: '2 GSa/s',
          interfaces: ['SPI', 'I2C', 'UART', 'USB'],
        },
        reqCert: false,
        certName: null,
        units: ['OSC-101-A', 'OSC-101-B'],
      },
      {
        slug: 'rigol-mso5074-oscilloscope',
        name: 'Rigol MSO5074 Mixed-Signal Oscilloscope',
        category: 'Electronics',
        description:
          '70 MHz 4-channel oscilloscope with 16-channel logic analyzer probe header for SPI, I2C, CAN, and RS232 bus capture.',
        imageUrl: '/equipment/rigol-oscilloscope.jpg',
        roomId: rEmb,
        bench: 'Bench E4 (Demo)',
        specs: {
          bandwidth: '70 MHz',
          channels: '4 Analog + 16 Digital',
          samplingRate: '8 GSa/s',
          interfaces: ['SPI', 'I2C', 'UART', 'LAN'],
        },
        reqCert: false,
        certName: null,
        units: ['RIG-201-A'],
      },
      {
        slug: 'arduino-mega-2560-sensor-kit',
        name: 'Arduino Mega 2560 & Sensor Prototyping Kit',
        category: 'IoT',
        description:
          'ATmega2560 microcontroller workbench complete with OLED display, ultrasonic/DHT22/IMU sensors, motor driver shield, logic level shifter, and breadboard kit.',
        imageUrl: '/equipment/arduino-kit.jpg',
        roomId: rIot,
        bench: 'Bench I2 (Demo)',
        specs: {
          architecture: 'AVR ATmega2560 (54 Digital I/O, 16 Analog)',
          interfaces: ['SPI', 'I2C', '4x UART', 'PWM'],
          power: '5V USB / 7–12V DC',
        },
        reqCert: false,
        certName: null,
        units: ['ARD-204-A', 'ARD-204-B', 'ARD-204-C'],
      },
      {
        slug: 'xilinx-artix7-fpga-kit',
        name: 'Xilinx Artix-7 Nexys A7 FPGA Kit',
        category: 'Embedded Systems',
        description:
          'High-capacity Artix-7 XC7A100T FPGA development board with Vivado ML suite, Pmod expansion ports, VGA, and Ethernet PHY for hardware accelerators.',
        imageUrl: '/equipment/fpga-kit.jpg',
        roomId: rEmb,
        bench: 'Bench F1 (Demo)',
        specs: {
          architecture: 'Xilinx Artix-7 XC7A100T (15,850 Logic Slices)',
          interfaces: ['Pmod', 'SPI', 'I2C', 'UART', 'Ethernet'],
          power: '5V External Adapter / USB-JTAG',
        },
        reqCert: true,
        certName: 'ESD & FPGA Hardware Safety L1',
        units: ['FPGA-201-A', 'FPGA-201-B'],
      },
      {
        slug: 'terasic-de10-lite-fpga',
        name: 'Terasic DE10-Lite MAX 10 FPGA Kit',
        category: 'Embedded Systems',
        description:
          'Intel MAX 10 FPGA kit with 50K logic elements, Arduino Uno R3 header, SDRAM, accelerometer, and Quartus Prime workstation.',
        imageUrl: '/equipment/de10-fpga.jpg',
        roomId: rIot,
        bench: 'Bench F3 (Demo)',
        specs: {
          architecture: 'Intel MAX 10 10M50DAF484 (50K LE)',
          interfaces: ['Arduino Header', 'SPI', 'I2C', 'UART', 'VGA'],
          power: '5V USB Blaster',
        },
        reqCert: true,
        certName: 'ESD & FPGA Hardware Safety L1',
        units: ['DE10-204-A'],
      },
      {
        slug: 'raspberry-pi-5-edge-ai',
        name: 'Raspberry Pi 5 Edge AI & Vision Node',
        category: 'IoT',
        description:
          '8 GB Raspberry Pi 5 kit with active cooler, CSI camera module, GPIO breakout board, and MQTT/ROS2 Edge runtime.',
        imageUrl: '/equipment/raspberry-pi.jpg',
        roomId: rIot,
        bench: 'Bench I5 (Demo)',
        specs: {
          architecture: 'Quad-Core ARM Cortex-A76 2.4 GHz (8 GB RAM)',
          interfaces: ['GPIO', 'SPI', 'I2C', 'PCIe', 'Dual HDMI'],
          power: '27W USB-C PD',
        },
        reqCert: false,
        certName: null,
        units: ['RPI-204-A', 'RPI-204-B'],
      },
      {
        slug: '6dof-robotic-arm-station',
        name: '6-DOF Articulated Robotic Arm Workcell',
        category: 'Robotics',
        description:
          '6-axis articulated manipulator arm with parallel electric gripper, emergency-stop interlock, and ROS2 kinematics workstation.',
        imageUrl: '/equipment/robotic-arm.jpg',
        roomId: rRobo,
        bench: 'Safety Cell R1 (Demo)',
        specs: {
          payload: '1.5 kg max payload · 650 mm reach',
          precision: '±0.2 mm repeatability',
          interfaces: ['ROS2', 'USB-CAN', 'Modbus RTU'],
        },
        reqCert: true,
        certName: 'Robotics Cell & E-Stop Safety L2',
        units: ['ROBO-105-A'],
      },
      {
        slug: 'prusa-mk4-3d-printer',
        name: 'Prusa MK4 High-Speed FDM 3D Printer',
        category: 'Mechanical',
        description:
          'Precision PLA/PETG/TPU additive manufacturing printer with Nextruder load-cell leveling and enclosed air-filtered hood.',
        imageUrl: '/equipment/3d-printer.jpg',
        roomId: rMech,
        bench: 'Bay M1 (Demo)',
        specs: {
          buildVolume: '250 × 210 × 220 mm',
          precision: '0.05 mm layer resolution',
          interfaces: ['USB-C', 'Ethernet', 'PrusaConnect'],
        },
        reqCert: true,
        certName: 'Thermal Fabrication & Workshop Safety L1',
        units: ['3DP-108-A', '3DP-108-B'],
      },
      {
        slug: 'desktop-3axis-cnc-mill',
        name: 'Desktop 3-Axis Precision CNC PCB & Enclosure Mill',
        category: 'Mechanical',
        description:
          '3-axis CNC router for custom PCB isolation routing, acrylic housings, and aluminum sensor brackets with acrylic safety enclosure.',
        imageUrl: '/equipment/cnc-mill.jpg',
        roomId: rMech,
        bench: 'Bay M3 (Demo)',
        specs: {
          buildVolume: '300 × 200 × 85 mm',
          precision: '±0.025 mm positioning',
          interfaces: ['GRBL', 'USB', 'G-Code'],
        },
        reqCert: true,
        certName: 'Thermal Fabrication & Workshop Safety L1',
        units: ['CNC-108-A'],
      },
      {
        slug: 'fluke-65digit-multimeter',
        name: 'Fluke 8846A 6.5-Digit Precision Multimeter',
        category: 'Electronics',
        description:
          'High-accuracy bench multimeter for milli-ohm resistance, leakage current, and DC rail calibration.',
        imageUrl: '/equipment/multimeter.jpg',
        roomId: rElec,
        bench: 'Bench E2 (Demo)',
        specs: {
          precision: '0.0024% Basic DCV Accuracy (6.5 Digits)',
          interfaces: ['USB', 'RS-232', 'LAN'],
        },
        reqCert: false,
        certName: null,
        units: ['DMM-101-A', 'DMM-101-B'],
      },
      {
        slug: 'dual-dc-bench-power-supply',
        name: 'Programmable Triple-Output DC Bench Power Supply',
        category: 'Electronics',
        description:
          '3-channel programmable DC power supply (2× 0–30V / 3A + 5V/3A) with over-current limiting and waveform logging.',
        imageUrl: '/equipment/power-supply.jpg',
        roomId: rElec,
        bench: 'Bench E3 (Demo)',
        specs: {
          channels: '3 Isolated DC Outputs (195W Total)',
          power: '0–30V @ 3A per primary rail',
          interfaces: ['USB', 'LAN', 'SCPI'],
        },
        reqCert: false,
        certName: null,
        units: ['PSU-101-A'],
      },
      {
        slug: 'ppt-report-cad-workstation',
        name: 'Project Documentation, PPT & MATLAB Workstation',
        category: 'Computing',
        description:
          'Dual-monitor CAD, MATLAB, LaTeX, and Presentation/PPT workstation for compiling lab reports, oscilloscope plots, and final hackathon pitch decks.',
        imageUrl: '/equipment/ppt-workstation.jpg',
        roomId: rComp,
        bench: 'Desk C1 (Demo)',
        specs: {
          architecture: 'Workstation · 32 GB RAM · Dual 4K Display',
          interfaces: ['LaTeX', 'MATLAB', 'PowerPoint / PPT', 'Vivado', 'Python'],
          notes: 'Ideal for students preparing technical reports and PPT presentations.',
        },
        reqCert: false,
        certName: null,
        units: ['WS-112-A', 'WS-112-B'],
      },
    ];

    const idBySlug = new Map<string, number>();
    for (const item of items) {
      const res = insertEquip.run(
        item.slug,
        item.name,
        item.category,
        item.description,
        item.imageUrl,
        item.roomId,
        item.bench,
        JSON.stringify(item.specs),
        item.reqCert ? 1 : 0,
        item.certName,
        '[]'
      );
      const eqId = Number(res.lastInsertRowid);
      idBySlug.set(item.slug, eqId);
      for (const uCode of item.units) {
        insertUnit.run(eqId, uCode, 'available', 'Operational demo unit');
      }
    }

    // Wire cross-lab compatible IDs
    const linkCompat = (slugA: string, slugs: string[]) => {
      const idA = idBySlug.get(slugA);
      if (!idA) return;
      const ids = slugs.map((s) => idBySlug.get(s)).filter((x): x is number => Boolean(x));
      db.prepare('UPDATE equipment SET compatible_ids_json = ? WHERE id = ?').run(
        JSON.stringify(ids),
        idA
      );
    };

    linkCompat('keysight-dsox1204g-oscilloscope', ['rigol-mso5074-oscilloscope']);
    linkCompat('rigol-mso5074-oscilloscope', ['keysight-dsox1204g-oscilloscope']);
    linkCompat('xilinx-artix7-fpga-kit', ['terasic-de10-lite-fpga']);
    linkCompat('terasic-de10-lite-fpga', ['xilinx-artix7-fpga-kit']);
    linkCompat('arduino-mega-2560-sensor-kit', ['raspberry-pi-5-edge-ai']);
    linkCompat('raspberry-pi-5-edge-ai', ['arduino-mega-2560-sensor-kit']);
    linkCompat('prusa-mk4-3d-printer', ['desktop-3axis-cnc-mill']);
    linkCompat('desktop-3axis-cnc-mill', ['prusa-mk4-3d-printer']);
  });

  insertDemo();
}
