library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Interactive simulation drives CLOCK_50 at 1 kHz, so this demo uses 1,000
-- cycles per second. See README.md before synthesizing for hardware.
entity timer_top is
  port (
    CLOCK_50 : in  std_logic;
    KEY      : in  std_logic_vector(3 downto 0);
    HEX0     : out std_logic_vector(6 downto 0);
    HEX1     : out std_logic_vector(6 downto 0);
    HEX2     : out std_logic_vector(6 downto 0);
    HEX3     : out std_logic_vector(6 downto 0);
    LEDG     : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of timer_top is
  constant CLOCK_FREQ_HZ : natural := 1_000;
  signal divider : natural range 0 to CLOCK_FREQ_HZ - 1 := 0;
  signal seconds : natural range 0 to 3599 := 0;
  signal running : std_logic := '1';
  signal key0_previous : std_logic := '1';

  function segments(digit : natural) return std_logic_vector is
  begin
    case digit is
      when 0 => return "1000000";
      when 1 => return "1111001";
      when 2 => return "0100100";
      when 3 => return "0110000";
      when 4 => return "0011001";
      when 5 => return "0010010";
      when 6 => return "0000010";
      when 7 => return "1111000";
      when 8 => return "0000000";
      when 9 => return "0010000";
      when others => return "1111111";
    end case;
  end function;
begin
  process (CLOCK_50)
  begin
    if rising_edge(CLOCK_50) then
      if KEY(1) = '0' then
        seconds <= 0;
        divider <= 0;
      elsif KEY(0) = '0' and key0_previous = '1' then
        running <= not running;
      elsif running = '1' then
        if divider = CLOCK_FREQ_HZ - 1 then
          divider <= 0;
          if seconds = 3599 then seconds <= 0; else seconds <= seconds + 1; end if;
        else
          divider <= divider + 1;
        end if;
      end if;
      key0_previous <= KEY(0);
    end if;
  end process;

  HEX3 <= segments(seconds / 600);
  HEX2 <= segments((seconds / 60) mod 10);
  HEX1 <= segments((seconds mod 60) / 10);
  HEX0 <= segments(seconds mod 10);
  LEDG <= "0000000" & running;
end architecture;
