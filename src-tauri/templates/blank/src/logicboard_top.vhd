library ieee;
use ieee.std_logic_1164.all;

-- Add ports and map them to board devices in LogicBoard Studio.
entity logicboard_top is
  port (
    SW   : in  std_logic_vector(9 downto 0);
    LEDR : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of logicboard_top is
begin
  LEDR <= SW;
end architecture;
