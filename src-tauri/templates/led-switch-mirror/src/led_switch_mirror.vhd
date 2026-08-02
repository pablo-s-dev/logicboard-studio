library ieee;
use ieee.std_logic_1164.all;

-- Every physical switch directly controls the red LED above it.
entity led_switch_mirror is
  port (
    SW   : in  std_logic_vector(9 downto 0);
    LEDR : out std_logic_vector(9 downto 0)
  );
end entity;

architecture combinational of led_switch_mirror is
begin
  LEDR <= SW;
end architecture;
